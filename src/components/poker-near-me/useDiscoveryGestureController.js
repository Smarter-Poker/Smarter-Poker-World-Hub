import { useCallback, useRef } from 'react';
import { EVENTS_SUB_TABS, MORE_SUB_TABS, TAB_ORDER } from './discoveryController';

function isMapGesture(event) {
  return Boolean(event.target.closest?.('.leaflet-container'));
}

export function isDiscoveryScrolledToTop(node, runtimeWindow = window, runtimeDocument = document) {
  const documentTop =
    runtimeWindow.scrollY || runtimeDocument.documentElement?.scrollTop || 0;
  if (documentTop > 0) return false;
  let element = node;
  while (element && element.nodeType === 1 && element !== runtimeDocument.body) {
    if (element.scrollTop > 0) return false;
    element = element.parentElement;
  }
  return true;
}

export default function useDiscoveryGestureController({
  activeTab,
  activeEventTab,
  activeMoreTab,
  showLiveTab,
  setActiveTab,
  setActiveEventTab,
  setActiveMoreTab,
  setShowLiveTab,
  setPullDistance,
  isRefreshing,
  setIsRefreshing,
  fetchAllDataRef,
}) {
  const touchStartRef = useRef(null);
  const touchEndRef = useRef(null);
  const pullStartRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const pullIndicatorRef = useRef(null);
  const pullLabelRef = useRef(null);
  const pullPastThresholdRef = useRef(false);

  const handleTouchStart = useCallback((event) => {
    if (isMapGesture(event)) return;
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      time: Date.now(),
    };
    touchEndRef.current = null;
  }, []);

  const handleTouchMove = useCallback((event) => {
    if (isMapGesture(event)) return;
    touchEndRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !touchEndRef.current) return;
    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = touchEndRef.current.y - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    if (
      Math.abs(deltaX) > 80 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
      elapsed < 500
    ) {
      if (showLiveTab) {
        const liveIndex = TAB_ORDER.indexOf('live');
        const nextTab = deltaX < 0 ? TAB_ORDER[liveIndex + 1] : TAB_ORDER[liveIndex - 1];
        if (nextTab) {
          setShowLiveTab(false);
          setActiveTab(nextTab);
        }
      } else if (activeTab === 'events') {
        const eventIndex = EVENTS_SUB_TABS.indexOf(activeEventTab);
        if (eventIndex !== -1) {
          if (deltaX < 0 && eventIndex < EVENTS_SUB_TABS.length - 1) {
            setActiveEventTab(EVENTS_SUB_TABS[eventIndex + 1]);
          } else if (deltaX > 0 && eventIndex > 0) {
            setActiveEventTab(EVENTS_SUB_TABS[eventIndex - 1]);
          } else if (deltaX > 0 && eventIndex === 0) {
            setActiveTab('venues');
          } else if (deltaX < 0 && eventIndex === EVENTS_SUB_TABS.length - 1) {
            setActiveTab('live');
            setShowLiveTab(true);
          }
        }
      } else if (activeTab === 'more') {
        const moreIndex = MORE_SUB_TABS.indexOf(activeMoreTab);
        if (moreIndex !== -1) {
          if (deltaX < 0 && moreIndex < MORE_SUB_TABS.length - 1) {
            setActiveMoreTab(MORE_SUB_TABS[moreIndex + 1]);
          } else if (deltaX > 0 && moreIndex > 0) {
            setActiveMoreTab(MORE_SUB_TABS[moreIndex - 1]);
          } else if (deltaX > 0 && moreIndex === 0) {
            setActiveTab('saved');
          }
        }
      } else {
        const currentIndex = TAB_ORDER.indexOf(activeTab);
        if (currentIndex !== -1) {
          const nextTab = deltaX < 0
            ? TAB_ORDER[currentIndex + 1]
            : TAB_ORDER[currentIndex - 1];
          if (nextTab) {
            setActiveTab(nextTab);
            if (nextTab === 'live') setShowLiveTab(true);
          }
        }
      }
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [
    activeTab,
    activeEventTab,
    activeMoreTab,
    setActiveEventTab,
    setActiveMoreTab,
    setActiveTab,
    setShowLiveTab,
    showLiveTab,
  ]);

  const handlePullStart = useCallback((event) => {
    if (isMapGesture(event)) return;
    if (isDiscoveryScrolledToTop(event.target)) {
      pullStartRef.current = event.touches[0].clientY;
    }
  }, []);

  const handlePullMove = useCallback((event) => {
    if (pullStartRef.current === null) return;
    const distance = event.touches[0].clientY - pullStartRef.current;
    if (distance <= 0 || distance >= 150) return;
    pullDistanceRef.current = distance;
    const indicator = pullIndicatorRef.current;
    if (!indicator) {
      setPullDistance(distance);
      return;
    }
    indicator.style.height = `${distance * 0.5}px`;
    indicator.style.opacity = String(Math.min(distance / 80, 1));
    const pastThreshold = distance > 80;
    if (pastThreshold !== pullPastThresholdRef.current) {
      pullPastThresholdRef.current = pastThreshold;
      if (pullLabelRef.current) {
        pullLabelRef.current.textContent = pastThreshold
          ? '↑ Release to refresh'
          : '↓ Pull to refresh';
      }
    }
  }, [setPullDistance]);

  const handlePullEnd = useCallback(() => {
    const distance = pullDistanceRef.current;
    pullPastThresholdRef.current = false;
    setPullDistance(0);
    pullDistanceRef.current = 0;
    pullStartRef.current = null;
    if (distance > 80 && !isRefreshing) {
      setIsRefreshing(true);
      const refresh = fetchAllDataRef.current?.({ includeVenues: true });
      if (refresh && typeof refresh.finally === 'function') {
        refresh.finally(() => setIsRefreshing(false));
      } else {
        setIsRefreshing(false);
      }
    }
  }, [fetchAllDataRef, isRefreshing, setIsRefreshing, setPullDistance]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePullStart,
    handlePullMove,
    handlePullEnd,
    pullIndicatorRef,
    pullLabelRef,
  };
}
