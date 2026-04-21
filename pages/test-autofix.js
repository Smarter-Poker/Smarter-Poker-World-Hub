import React from 'react';
import { nonExistentThing } from '../lib/does-not-exist-for-autofix-test';

export default function TestAutofix() {
  return <div>{nonExistentThing()}</div>;
}
