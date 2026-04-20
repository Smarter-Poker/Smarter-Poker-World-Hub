import React from 'react';

function BrokenThing() {
  return <span>Autopilot Test Component</span>;
}

export default function AutofixAutopilotTestV2() {
  return (
    <div>
      <h1>Autopilot Test v2</h1>
      <BrokenThing />
    </div>
  );
}