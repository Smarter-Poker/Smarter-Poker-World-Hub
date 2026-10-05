function redirectedQuery(query, tab) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
        if (key === 'tab') continue;
        if (Array.isArray(value)) value.forEach((entry) => params.append(key, String(entry)));
        else if (value !== undefined && value !== null) params.set(key, String(value));
    }
    params.set('tab', tab);
    return params.toString();
}

export async function getServerSideProps({ query }) {
    return {
        redirect: {
            destination: `/horses?${redirectedQuery(query, 'sql-console')}`,
            permanent: false,
        },
    };
}

export default function SqlConsoleRedirect() {
    return null;
}
