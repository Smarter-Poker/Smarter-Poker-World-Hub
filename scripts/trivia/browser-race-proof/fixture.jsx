import React, { createContext, useContext } from 'react';
export const identity = createContext({ id: 'account-a' });
export const useAvatar = () => {
  const user = useContext(identity);
  return { user, loading: user.loading === true };
};
export const getAuthUser = () => window.fixtureAccount;
export const getAccessToken = () => 'isolated-browser-fixture';
export const authedFetch = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, 'x-fixture-account': window.fixtureAccount.id },
  });
export const supabase = {
  from(table) {
    let id = null;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        if (k === 'id' || k === 'user_id') id = v;
        return q;
      },
      maybeSingle() {
        return fetch('/fixture/read?table=' + table + '&id=' + id).then((r) => r.json());
      },
    };
    return q;
  },
  rpc(name, args) {
    return fetch('/fixture/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fixture-account': window.fixtureAccount.id,
      },
      body: JSON.stringify({ name, args }),
    }).then((r) => r.json());
  },
  channel() {
    const q = {
      on() {
        return q;
      },
      subscribe() {
        return q;
      },
    };
    return q;
  },
  removeChannel() {},
};
export const readOwnProfile = async () => ({ data: { diamonds: 1000 } });
export default { init: async () => {}, isVIP: async () => false };
