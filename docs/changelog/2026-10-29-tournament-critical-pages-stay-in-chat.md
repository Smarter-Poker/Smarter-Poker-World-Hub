# Tournament critical pages stay in Production Alerts

The critical pager already records stuck tournaments into the durable operational inbox before returning a pending page. It then sent the same failure through email and SMS. Tournament pages now retain the chat destination without calling either sender or fabricating emailed/sms receipts. Existing pending pages follow the same rule; repeated invocations cannot send them. Other critical page types retain their existing policy.

Focused handler tests exercise the actual route with isolated dependencies for repeated tournament pages, a future rule carrying tournament_id, unrelated critical delivery, authorization refusal and durable scan failure. The required operational inbox workflow executes this regression. Publication and real event/provider evidence remain necessary before calling the routing fixed live.
