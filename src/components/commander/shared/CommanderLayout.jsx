/**
 * Commander Layout Wrapper
 * Wraps commander pages with error boundary and common head elements
 * Usage: import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
 *        export default function MyPage() { return <CommanderLayout>...</CommanderLayout>; }
 */
import Head from 'next/head';
import CommanderErrorBoundary from './CommanderErrorBoundary';

export default function CommanderLayout({ children, title }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {title && <title>{title} | Club Commander</title>}
      </Head>
      <CommanderErrorBoundary>
        {children}
      </CommanderErrorBoundary>
    </>
  );
}
