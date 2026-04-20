import React from 'react';

function BrokenThing() {
  return <span>Autopilot placeholder component</span>;
}

export default function AutofixAutopilotTestV2() {
  return (
    <div>
      <h1>Autopilot Test v2</h1>
      <BrokenThing />
    </div>
  );
}