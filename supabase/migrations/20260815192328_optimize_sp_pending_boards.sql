CREATE OR REPLACE FUNCTION public.sp_pending_boards(p_gt text, p_stack integer, p_prefix text DEFAULT ''::text, p_positions text[] DEFAULT '{}'::text[], p_turn boolean DEFAULT false, p_limit integer DEFAULT 20000)
 RETURNS TABLE(board text)
 LANGUAGE plpgsql
AS $function$
 declare 
   _street text;
   _streets text[];
   _pats text[];
 begin
   -- Deduce the primary street from p_prefix (e.g. 'flop_')
   if p_prefix = 'flop_' then
     _streets := array['flop'];
   elsif p_prefix = 'turn_' then
     _streets := array['turn'];
   elsif p_prefix = 'river_' then
     _streets := array['river'];
   else
     -- Fallback if prefix is empty or unexpected
     _streets := array['flop', 'turn', 'river', 'preflop'];
   end if;

   if p_turn then
     _streets := array_append(_streets, 'turn');
   end if;
   
   -- Build the LIKE patterns as before
   select array_agg(coalesce(p_prefix,'') || p_gt || '_' || x || '_' || p_stack || 'bb_%')     
     into _pats from unnest(p_positions) x;                                                     
   
   if p_turn then                                                                              
     _pats := _pats || (select array_agg('turn_' || p_gt || '_' || x || '_' || p_stack || 'bb_%')
                        from unnest(p_positions) x);                                           
   end if;                                                                                     
   
   if _pats is null then return; end if;                                                        

   return query                                                                                
     select distinct substr(regexp_replace(g.scenario_hash, '^.*_', ''), 1, 6)                 
       from unnest(_pats) as pat
       cross join lateral (
         select scenario_hash 
         from solved_spots_gold g                                                                
         where g.game_type = p_gt                                                                 
           and g.stack_depth = p_stack                                                            
           and g.street = any(_streets)
           and g.strategy_matrix_v2 is null                                                       
           and g.scenario_hash >= replace(pat, '%', '')
           and g.scenario_hash < replace(pat, '%', '') || '~'
           and g.scenario_hash like pat
         limit p_limit
       ) g
      order by 1                                                                               
      limit p_limit;                                                                           
 end;
$function$;
