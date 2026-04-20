import React from 'react';

// Intentional bad import to trigger a build failure
import NonExistentComponent from '../../components/NonExistentComponentWhichBreaksTheBuild';

export default function TestAutofixPage() {
  return (
    <div>
      <h1>Testing Vercel Autofix</h1>
      <NonExistentComponent />
    </div>
  );
}
