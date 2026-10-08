import React from 'react';
export default function Chrome({ children }) {
  return <>{children}</>;
}
export const useRouter = () => ({
  push() {},
  events: { on() {}, off() {} },
  isReady: true,
  query: {},
});
