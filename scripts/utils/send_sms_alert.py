#!/usr/bin/env python3
"""Legacy workflow entry point. Record operational faults in the task inbox."""
import os
import sys
import json
import hashlib
import urllib.request


def send_alert():
    secret = os.environ.get('CRON_SECRET', '').strip()
    if not secret:
        raise RuntimeError('Operational inbox authentication missing')
    detail = sys.argv[1] if len(sys.argv) > 1 else 'Unknown error'
    payload = {'message': detail, 'repository': os.environ.get('GITHUB_REPOSITORY', ''),
               'run_id': os.environ.get('GITHUB_RUN_ID', ''),
               'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT', '')}
    body = {'source': 'github-scraper-pipeline', 'alertname': 'ScraperPipelineFailed',
            'status': 'firing', 'severity': 'critical', 'payload': payload,
            'eventKey': hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()}
    req = urllib.request.Request('https://smarter.poker/api/internal/operational-alert',
        data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        result = json.load(response)
        if result.get('recorded') is not True:
            raise RuntimeError('Operational inbox did not acknowledge the event')
    print('Operational fault recorded for investigation in Codex')


if __name__ == '__main__':
    send_alert()
