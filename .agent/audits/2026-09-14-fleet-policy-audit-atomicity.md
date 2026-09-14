# Fleet Policy Changes Keep Their Audit Receipt

The policy RPC caught an audit insert error and committed the change anyway, returning `ok: true`. A native reproduction changed the cap from 100 to 80 while leaving no audit row. Two simultaneous writers also read 100 as their previous cap even though the first had already changed it to 80; the second 120-cap edit was incorrectly classified as nonmaterial inside the function.

The policy now commits with its exact stored audit receipt. A missing, rejected or altered receipt aborts the change. Per-scope transaction claims and row locks make the stored before-state match the actual predecessor, including first-row creation. Policy timestamps follow the serialized update, so a transaction that waited cannot publish an older version.

The five-argument service-only RPC and response keys remain intact. No operator setting, horse behavior, payment or approval configuration is changed. The route's separately read approval preview and cumulative materiality still require independent qualification; this patch does not claim to solve them.

Validation uses the actual three captured function bodies, live policy column types and constraints, and private PostgreSQL 17. Required CI runs the same executable native fixture. Deployment and live definition readback remain separate acceptance steps.
