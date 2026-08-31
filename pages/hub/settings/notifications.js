/**
 * /hub/settings/notifications -- the notification settings screen.
 *
 * Every push notification in the product links here when something goes wrong,
 * and every "enable push" call to action lands here, so this route must exist
 * and must render for a signed-out user without crashing.
 */
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAuthUser } from '../../../src/lib/authUtils';
import PushNotificationToggle from '../../../src/components/notifications/PushNotificationToggle';

export default function NotificationSettingsPage() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const user = getAuthUser();
        setUserId(user?.id || null);
        setChecked(true);
    }, []);

    return (
        <>
            <Head>
                <title>Notification Settings | Smarter Poker</title>
                <meta name="robots" content="noindex" />
            </Head>

            <div className="min-h-screen bg-[#0B1120] px-4 py-8 text-white">
                <div className="mx-auto w-full max-w-2xl">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="mb-4 text-sm text-gray-400 hover:text-white"
                    >
                        Back
                    </button>

                    <h1 className="text-2xl font-bold">Notifications</h1>
                    <p className="mt-1 text-sm text-gray-400">
                        Choose What Reaches Your Phone And What Stays In The App.
                    </p>

                    <div className="mt-6">
                        {!checked ? (
                            <p className="text-sm text-gray-500">Loading...</p>
                        ) : !userId ? (
                            <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
                                <p className="text-sm text-gray-300">Sign In To Manage Your Notification Settings.</p>
                                <button
                                    type="button"
                                    onClick={() => router.push('/login')}
                                    className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-[#04211E]"
                                >
                                    Sign In
                                </button>
                            </div>
                        ) : (
                            <PushNotificationToggle />
                        )}
                    </div>

                    <p className="mt-6 text-xs text-gray-500">
                        Notifications You Have Already Received Stay In The Bell For 90 Days.
                    </p>
                </div>
            </div>
        </>
    );
}
