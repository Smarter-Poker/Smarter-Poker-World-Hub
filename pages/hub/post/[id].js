/**
 * /hub/post/[id] — canonical single-post URL.
 *
 * 2026-08-15 audit: every share surface (SharePostModal copy/X/WhatsApp,
 * SharedPostCard messenger embeds, share-to-feed link posts) has always
 * pointed at /hub/post/<id> — a route that never existed, so every shared
 * link 404'd. The feed's ?post= deep-link handler is the real renderer;
 * this route redirects into it server-side so old and new links both work.
 */
export async function getServerSideProps({ params }) {
  const id = String(params?.id || '');
  const safe = /^[0-9a-f-]{36}$/i.test(id) ? id : '';
  return {
    redirect: {
      destination: safe ? `/hub/social-media?post=${safe}` : '/hub/social-media',
      permanent: false,
    },
  };
}

export default function PostRedirect() {
  return null;
}
