import re

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'r') as f:
    code = f.read()

old_code = """class StatusErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    seo: React.ReactNode;
    header: React.ReactNode;
    nav: React.ReactNode;
  },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; seo: React.ReactNode; header: React.ReactNode; nav: React.ReactNode }) {"""

new_code = """
interface StatusErrorBoundaryProps {
  children: React.ReactNode;
  seo: React.ReactNode;
  header: React.ReactNode;
  nav: React.ReactNode;
}

class StatusErrorBoundary extends React.Component<
  StatusErrorBoundaryProps,
  { hasError: boolean; error?: Error }
> {
  constructor(props: StatusErrorBoundaryProps) {"""

code = code.replace(old_code, new_code)

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'w') as f:
    f.write(code)
