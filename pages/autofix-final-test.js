import React from 'react';
// BAD IMPORT — intentional build breaker for definitive autopilot test
import { BrokenComponent } from '../src/components/DOES_NOT_EXIST_final_test';

export default function AutofixFinalTest() {
  return (
    <div>
      <h1>Final Autopilot Test</h1>
      <BrokenComponent />
    </div>
  );
}
