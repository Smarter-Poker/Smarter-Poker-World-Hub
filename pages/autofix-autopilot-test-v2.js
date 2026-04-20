import React from 'react';
// BAD IMPORT — intentional build breaker for autopilot test
import { BrokenThing } from '../src/components/DOES_NOT_EXIST_autopilot_v2';

export default function AutofixAutopilotTestV2() {
  return (
    <div>
      <h1>Autopilot Test v2</h1>
      <BrokenThing />
    </div>
  );
}
