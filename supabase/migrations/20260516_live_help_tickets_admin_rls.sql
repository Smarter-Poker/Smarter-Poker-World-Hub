-- Add RLS policies for admin and support to view and manage live_help_tickets
CREATE POLICY "Admins and Support can view all tickets"
ON public.live_help_tickets
FOR SELECT
TO authenticated
USING (
    ((SELECT auth.jwt()) ->> 'email') IN ('admin@smarter.poker', 'support@smarter.poker')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_agent', 'owner')
    )
);

CREATE POLICY "Admins and Support can update all tickets"
ON public.live_help_tickets
FOR UPDATE
TO authenticated
USING (
    ((SELECT auth.jwt()) ->> 'email') IN ('admin@smarter.poker', 'support@smarter.poker')
    OR
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'super_agent', 'owner')
    )
);
