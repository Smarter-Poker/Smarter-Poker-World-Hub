SET test.service='true';
SELECT fn_accounting_record_received_payment('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000081',100,200,'reader-proof');
DO $$ DECLARE r jsonb; b text; BEGIN
 SELECT x INTO r FROM jsonb_array_elements(ca_club_union_invoices('00000000-0000-4000-8000-000000000010')) x WHERE x->>'invoice_id'='00000000-0000-4000-8000-000000000080';
 IF r IS NULL OR (r->>'paid_total')::numeric<>100 OR (r->>'outstanding')::numeric<>100 THEN RAISE EXCEPTION 'Club reader omitted receipt'; END IF;
 r:=ca_union_statement_board('00000000-0000-4000-8000-000000000099','2026-11-16');
 IF (r->'clubs'->0->>'paid_total')::numeric<>100 OR (r->'clubs'->0->>'outstanding')::numeric<>100 THEN RAISE EXCEPTION 'Union board omitted receipt %',r; END IF;
 b:=smarter_private.union_weekly_invoice_body('00000000-0000-4000-8000-000000000080');
 IF b IS NULL OR position('Paid So Far: 100.00' in b)=0 OR position('Remaining Unpaid Balance: 100.00' in b)=0 THEN RAISE EXCEPTION 'Document reader omitted receipt %',b; END IF;
END $$;
SELECT fn_accounting_record_received_payment('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000082',100,100,'reader-proof-final');
DO $$ DECLARE r jsonb; BEGIN
 r:=ca_union_statement_board('00000000-0000-4000-8000-000000000099','2026-11-16');
 IF (r->'clubs'->0->>'payment_details_available')::boolean IS DISTINCT FROM true OR (r->'clubs'->0->>'outstanding')::numeric<>0 THEN RAISE EXCEPTION 'Full receipt became unavailable'; END IF;
END $$;
SELECT 'Existing club, union board and invoice text readers include partial/full immutable receipts' result;
