/**
 *  SMARTER.POKER MESSENGER V2.0
 * Full-featured SmarterPoker Messenger clone with premium design
 * Real-time chat, read receipts, typing indicators, and poker-themed UI
 * Enhanced with: optimistic updates, message reactions, sound notifications
 */

import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import Image from 'next/image';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getAccessToken, ensureAuthReady, authedFetch } from '../../src/lib/authUtils';
import { broadcastSync } from '../../src/lib/broadcastSync';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { messengerPreferences } from '../../src/services/preferences-service';
import ReportBugWidget from '../../src/components/ui/ReportBugWidget';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';
