 CREATE OR REPLACE FUNCTION public.fn_enforce_anti_farming_caps()                              
  RETURNS trigger                                                                              
  LANGUAGE plpgsql                                                                             
  SET search_path TO 'public'                                                                  
 AS $function$                                                                                 
 DECLARE                                                                                       
   v_recipient uuid;                                                                           
   v_check     jsonb;                                                                          
   v_kingfish  uuid := '47965354-0e56-43ef-931c-ddaab82af765';                                 
 BEGIN                                                                                         
   -- Only enforce on outbound (debit) rows                                                    
   IF NEW.amount IS NULL OR NEW.amount >= 0 THEN                                               
     RETURN NEW;                                                                               
   END IF;                                                                                     
                                                                                               
   -- Only on user→user diamond movement channels.                                             
   -- COALESCE coerces NULL to '' so NULL columns evaluate to FALSE (not NULL)                 
   -- in the IN check. Critical because deduct_diamonds writes source=NULL on                  
   -- every non-gift call (game_cost, course_purchase, etc.) and we need those                 
   -- to fall through to the early RETURN NEW.                                                 
   IF NOT (                                                                                    
        COALESCE(NEW.transaction_type, '') IN ('live_gift_sent','diamond_gift_sent')           
     OR COALESCE(NEW.source, '') IN ('stream_gift','wallet_transfer','wallet_diamond_transfer')
   ) THEN                                                                                      
     RETURN NEW;                                                                               
   END IF;                                                                                     
                                                                                               
   -- KINGFISH sender bypass                                                                   
   IF NEW.user_id = v_kingfish THEN                                                            
     RETURN NEW;                                                                               
   END IF;                                                                                     
                                                                                               
   -- Recipient_id required in metadata for enforced channels                                  
   v_recipient := NULLIF(NEW.metadata->>'recipient_id', '')::uuid;                             
   IF v_recipient IS NULL THEN                                                                 
     RAISE EXCEPTION 'Anti-farming: recipient_id missing from metadata for % transaction',     
       COALESCE(NEW.transaction_type, NEW.source)                                              
       USING ERRCODE = 'check_violation';                                                      
   END IF;                                                                                     
                                                                                               
   -- Delegate to shared cap function                                                          
   v_check := public.fn_check_anti_farming_gift_cap(NEW.user_id, v_recipient, ABS(NEW.amount));
                                                                                               
   IF NOT (v_check->>'allowed')::boolean THEN                                                  
     RAISE EXCEPTION 'Anti-farming: %', v_check->>'reason'                                     
       USING ERRCODE = 'check_violation', DETAIL = v_check::text;                              
   END IF;                                                                                     
                                                                                               
   RETURN NEW;                                                                                 
 END;                                                                                          
 $function$;
 

GRANT EXECUTE ON FUNCTION public.fn_enforce_anti_farming_caps() TO authenticated;
COMMENT ON FUNCTION public.fn_enforce_anti_farming_caps() IS 'Anti-farming trigger';
