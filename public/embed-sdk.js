/**
 * Smarter.Poker Zero-Dependency Partner Widget SDK (https://smarter.poker/embed-sdk.js)
 *
 * Usage:
 *   <div data-smarter-poker-widget="odds-calculator" data-partner="example.com"></div>
 *   <script async src="https://smarter.poker/embed-sdk.js"></script>
 */
(function () {
  'use strict';

  var WIDGET_REGISTRY = {
    'odds-calculator': {
      path: '/tools/poker-odds-calculator',
      title: 'Multiway Poker Odds Calculator',
      anchor: 'Smarter.Poker Free Poker Odds Calculator',
      height: 780
    },
    'poker-odds-calculator': {
      path: '/tools/poker-odds-calculator',
      title: 'Multiway Poker Odds Calculator',
      anchor: 'Smarter.Poker Free Poker Odds Calculator',
      height: 780
    },
    'icm-calculator': {
      path: '/tools/icm-calculator',
      title: 'Tournament ICM Calculator',
      anchor: 'Smarter.Poker Tournament ICM Calculator',
      height: 720
    },
    'preflop-ranges': {
      path: '/tools/preflop-ranges',
      title: 'GTO Preflop Range Matrix Hub',
      anchor: 'Smarter.Poker GTO Preflop Ranges',
      height: 820
    },
    'pot-odds-calculator': {
      path: '/tools/pot-odds-calculator',
      title: 'Pot Odds, Implied Odds & MDF Calculator',
      anchor: 'Smarter.Poker Pot Odds & MDF Calculator',
      height: 740
    },
    'push-fold-calculator': {
      path: '/tools/push-fold-calculator',
      title: 'Short-Stack Push/Fold Nash Equilibrium Chart',
      anchor: 'Smarter.Poker Push/Fold Nash Chart',
      height: 780
    },
    'bankroll-calculator': {
      path: '/tools/bankroll-calculator',
      title: 'Poker Bankroll & Risk Of Ruin Calculator',
      anchor: 'Smarter.Poker Bankroll & Risk Of Ruin Calculator',
      height: 720
    },
    'bounty-calculator': {
      path: '/tools/bounty-calculator',
      title: 'PKO & Mystery Bounty Chip Equity Calculator',
      anchor: 'Smarter.Poker PKO & Mystery Bounty Calculator',
      height: 740
    },
    'poker-winrate-calculator': {
      path: '/tools/poker-winrate-calculator',
      title: 'Poker Winrate (BB/100 To $/Hr) & Volume Calculator',
      anchor: 'Smarter.Poker Winrate & Hourly Earnings Calculator',
      height: 720
    },
    'side-pot-calculator': {
      path: '/tools/side-pot-calculator',
      title: 'Multi-Way All-In Main & Side Pot Calculator',
      anchor: 'Smarter.Poker Multi-Way Side Pot Calculator',
      height: 760
    },
    'blind-structure-calculator': {
      path: '/tools/blind-structure-calculator',
      title: 'Tournament Blind Structure & Chip Distribution Generator',
      anchor: 'Smarter.Poker Tournament Blind Structure Generator',
      height: 780
    },
    'spr-calculator': {
      path: '/tools/spr-calculator',
      title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
      anchor: 'Smarter.Poker SPR & Geometric Sizing Calculator',
      height: 740
    },
    'plo-bet-calculator': {
      path: '/tools/plo-bet-calculator',
      title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
      anchor: 'Smarter.Poker PLO Max Bet & Bomb Pot Calculator',
      height: 760
    },
    'payout-calculator': {
      path: '/tools/payout-calculator',
      title: 'Tournament Payout & Prize Pool Distribution Calculator',
      anchor: 'Smarter.Poker Tournament Payout Calculator',
      height: 780
    },
    'rake-calculator': {
      path: '/tools/rake-calculator',
      title: 'Live Cash Game Rake & Time-Charge Calculator',
      anchor: 'Smarter.Poker Live Cash Rake Calculator',
      height: 760
    },
    '3bet-calculator': {
      path: '/tools/3bet-calculator',
      title: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
      anchor: 'Smarter.Poker GTO 3-Bet & 4-Bet Calculator',
      height: 740
    },
    'chop-calculator': {
      path: '/tools/chop-calculator',
      title: 'Final Table Deal & ICM Chop Calculator',
      anchor: 'Smarter.Poker Final Table ICM Chop Calculator',
      height: 780
    },
    'variance-calculator': {
      path: '/tools/variance-calculator',
      title: 'Poker Variance & Downswing Simulator',
      anchor: 'Smarter.Poker Variance & Downswing Simulator',
      height: 760
    },
    'outs-calculator': {
      path: '/tools/outs-calculator',
      title: 'Poker Outs & Draw Probability Calculator',
      anchor: 'Smarter.Poker Outs & Draw Probability Calculator',
      height: 740
    },
    'poker-tax-calculator': {
      path: '/tools/poker-tax-calculator',
      title: 'US Poker Tax & Form W-2G Calculator',
      anchor: 'Smarter.Poker US Poker Tax & Form W-2G Calculator',
      height: 780
    },
    'staking-calculator': {
      path: '/tools/staking-calculator',
      title: 'Poker Staking & Markup Split Calculator',
      anchor: 'Smarter.Poker Staking & Markup Calculator',
      height: 760
    },
    'iso-calculator': {
      path: '/tools/iso-calculator',
      title: 'Pre-Flop Isolation Raise Sizing Calculator',
      anchor: 'Smarter.Poker Pre-Flop Isolation Raise Calculator',
      height: 740
    },
    'home-game-kit': {
      path: '/tools/home-game-kit',
      title: 'Home Game Chip Set & Setup Calculator',
      anchor: 'Smarter.Poker Home Game Chip Set Calculator',
      height: 780
    },
    'format-quiz': {
      path: '/tools/format-quiz',
      title: 'Poker Format Selector & Study Roadmap Quiz',
      anchor: 'Smarter.Poker Format Selector Quiz',
      height: 780
    }
  };

  function sanitizeHost(str) {
    return String(str || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function mountWidgets() {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('[data-smarter-poker-widget]');
    var defaultHost = typeof window !== 'undefined' && window.location ? window.location.hostname : '';

    for (var i = 0; i < nodes.length; i++) {
      var container = nodes[i];
      if (container.getAttribute('data-sp-mounted') === 'true') continue;

      var widgetKey = String(container.getAttribute('data-smarter-poker-widget') || 'odds-calculator').trim().toLowerCase();
      var spec = WIDGET_REGISTRY[widgetKey] || WIDGET_REGISTRY['odds-calculator'];
      var customHeight = parseInt(container.getAttribute('data-height') || '', 10);
      var height = !isNaN(customHeight) && customHeight >= 420 && customHeight <= 1200 ? customHeight : spec.height;
      var partner = sanitizeHost(container.getAttribute('data-partner') || defaultHost);
      var utmSuffix = partner ? '&utm_source=' + encodeURIComponent(partner) + '&utm_medium=embed-sdk' : '';
      var landerSuffix = partner ? '?utm_source=' + encodeURIComponent(partner) + '&utm_medium=embed-sdk' : '';

      var iframe = document.createElement('iframe');
      iframe.src = 'https://smarter.poker' + spec.path + '?embed=true' + utmSuffix;
      iframe.width = '100%';
      iframe.height = String(height);
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('title', spec.title);
      iframe.style.border = '0';
      iframe.style.borderRadius = '12px';
      iframe.style.overflow = 'hidden';
      iframe.style.maxWidth = '100%';
      iframe.style.display = 'block';

      var footer = document.createElement('p');
      footer.style.fontSize = '12px';
      footer.style.textAlign = 'center';
      footer.style.color = '#94AFCC';
      footer.style.marginTop = '6px';
      footer.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
      footer.appendChild(document.createTextNode('Powered By '));

      var link = document.createElement('a');
      link.href = 'https://smarter.poker' + spec.path + landerSuffix;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.color = '#4E9CFF';
      link.style.textDecoration = 'none';
      link.style.fontWeight = '600';
      link.textContent = spec.anchor;
      footer.appendChild(link);

      container.innerHTML = '';
      container.appendChild(iframe);
      container.appendChild(footer);
      container.setAttribute('data-sp-mounted', 'true');

      try {
        var beaconUrl =
          'https://smarter.poker/api/seo/referral-stats?event=record&category=widget_embeds&item=' +
          encodeURIComponent(widgetKey) +
          '&partner=' +
          encodeURIComponent(partner || 'anonymous-embed') +
          '&source=embed-sdk';
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(beaconUrl);
        } else if (typeof fetch === 'function') {
          fetch(beaconUrl, { method: 'POST', mode: 'cors', keepalive: true }).catch(function () {});
        }
      } catch (e) {
        // Ignore telemetry errors on restricted host pages
      }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountWidgets);
    } else {
      mountWidgets();
    }
  }
})();
