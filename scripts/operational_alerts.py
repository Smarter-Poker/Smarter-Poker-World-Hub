"""The one Python writer of operational alerts, for standalone scrapers.

Operational faults are recorded in public.operational_alert_events, and the
production-alerts fleet triages that store by payload.target_task_id. A row
without it reaches the store but never the lane that must fix it, so every
payload this module sends is addressed to the fleet at the moment it is sent.

The rule is the one src/lib/operationalAlerts.mjs applies in this repository:
a payload that names no destination (absent, null or blank) is addressed to the
fleet, one that names the fleet is kept, and one that names anything else is
refused, as smarter-poker-workers src/lib/operationalAlerts.ts refuses it. It is
never re-addressed, because a caller asking for another destination has a
defect it must see, and never recorded as it is, because the fleet would not
see the row.

scripts/local_scraper_runtime.py cannot import this module: its runner is copied
alone outside the release it supervises. It carries a mirror of FLEET_TASK_ID
and addressed(), and scripts/test_operational_alerts.py fails CI if the mirror
differs from this module.
"""
import hashlib
import json
import urllib.request


# The production-alerts fleet task: the destination of every operational alert.
FLEET_TASK_ID = '01a09b86-5ba8-7290-8657-1041f13dd3ca'
RECORDER = '/rest/v1/rpc/fn_record_operational_alert'


class ForeignDestination(ValueError):
    """The payload names a destination other than the production-alerts fleet."""


def addressed(payload):
    """Return a copy of payload whose target_task_id is the fleet's.

    Absent, null or blank names no destination and is filled. The fleet's id
    is kept. Any other value is refused with ForeignDestination.
    """
    if not isinstance(payload, dict):
        raise TypeError('an operational alert payload is a JSON object')
    requested = payload.get('target_task_id')
    if requested is None or (isinstance(requested, str) and not requested.strip()):
        return dict(payload, target_task_id=FLEET_TASK_ID)
    if requested == FLEET_TASK_ID:
        return dict(payload)
    raise ForeignDestination('payload.target_task_id names a task other than the production-alerts fleet')


def deliver(supabase_url, service_key, event, opener=None):
    """Record one event through fn_record_operational_alert and return its receipt.

    This is the module's only network path and it addresses the payload itself,
    so no caller can record a row the fleet cannot see.
    """
    if not service_key or not supabase_url:
        raise RuntimeError('Operational inbox credentials are missing')
    body = dict(event, p_payload=addressed(event.get('p_payload')))
    request = urllib.request.Request(
        supabase_url.rstrip('/') + RECORDER,
        data=json.dumps(body).encode(), method='POST',
        headers={'apikey': service_key, 'Authorization': 'Bearer ' + service_key,
                 'Content-Type': 'application/json'})
    with (opener or urllib.request.urlopen)(request, timeout=15) as response:
        receipt = json.load(response)
    if isinstance(receipt, bool) or not isinstance(receipt, int) or receipt <= 0:
        raise RuntimeError('Operational inbox did not return a receipt')
    return receipt


def record_alert(source, message, batch_id, supabase_url, service_key):
    evidence = {'message': message, 'batch_id': batch_id}
    # The destination is stored beside the evidence and never enters the key,
    # so one failure keeps one identity however it is routed.
    event_key = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    return deliver(supabase_url, service_key, {
        'p_source': source, 'p_event_key': event_key,
        'p_alertname': 'ScraperFailure', 'p_status': 'firing',
        'p_severity': 'critical', 'p_payload': evidence})
