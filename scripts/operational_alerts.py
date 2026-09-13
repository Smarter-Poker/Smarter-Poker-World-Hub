"""Service-only operational inbox transport for standalone scraper failures."""
import hashlib
import json
import urllib.request


def record_alert(source, message, batch_id, supabase_url, service_key):
    if not service_key or not supabase_url:
        raise RuntimeError('Operational inbox credentials are missing')
    evidence = {'message': message, 'batch_id': batch_id}
    event_key = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    body = {'p_source': source, 'p_event_key': event_key,
            'p_alertname': 'ScraperFailure', 'p_status': 'firing',
            'p_severity': 'critical', 'p_payload': evidence}
    request = urllib.request.Request(
        supabase_url.rstrip('/') + '/rest/v1/rpc/fn_record_operational_alert',
        data=json.dumps(body).encode(), method='POST',
        headers={'apikey': service_key, 'Authorization': 'Bearer ' + service_key,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        receipt = json.load(response)
    if isinstance(receipt, bool) or not isinstance(receipt, int) or receipt <= 0:
        raise RuntimeError('Operational inbox did not return a receipt')
    return receipt
