import React from 'react';
// THIS IMPORT DOES NOT EXIST — intentional build breaker for autopilot test
import { FakeComponent } from '../src/components/DOES_NOT_EXIST_autopilot';

export default function AutofixAutopilotTest() {
  return (
    <div>
      <h1>Autopilot Test Page</h1>
      <FakeComponent />
    </div>
  );
}
