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
    },
    'board-texture-analyzer': {
      path: '/tools/board-texture-analyzer',
      title: 'Flop Board Texture & GTO C-Bet Strategy Analyzer',
      anchor: 'Smarter.Poker Flop Board Texture & C-Bet Analyzer',
      height: 780
    },
    'm-ratio-calculator': {
      path: '/tools/m-ratio-calculator',
      title: 'Tournament Harrington M-Ratio & Effective M Calculator',
      anchor: 'Smarter.Poker Harrington M-Ratio Calculator',
      height: 760
    },
    'session-planner': {
      path: '/tools/session-planner',
      title: 'Live Cash Game Session, Stop-Loss & Annual Income Planner',
      anchor: 'Smarter.Poker Cash Game Session & Bankroll Planner',
      height: 780
    },
    'straddle-calculator': {
      path: '/tools/straddle-calculator',
      title: 'Live Straddle & Double-Board Bomb Pot EV Calculator',
      anchor: 'Smarter.Poker Live Straddle & Bomb Pot Calculator',
      height: 780
    },
    'hand-converter': {
      path: '/tools/hand-converter',
      title: 'Poker Hand History Formatter & SPR Street Analyzer',
      anchor: 'Smarter.Poker Hand History Formatter',
      height: 820
    },
    'satellite-calculator': {
      path: '/tools/satellite-calculator',
      title: 'Satellite Bubble Factor & Seat-Lock Threshold Calculator',
      anchor: 'Smarter.Poker Satellite Bubble & Seat-Lock Calculator',
      height: 760
    },
    'promo-ev-calculator': {
      path: '/tools/promo-ev-calculator',
      title: 'Bad Beat Jackpot (BBJ) & High-Hand Promo EV Calculator',
      anchor: 'Smarter.Poker Bad Beat Jackpot & Promo EV Calculator',
      height: 780
    },
    'who-wins-calculator': {
      path: '/tools/who-wins-calculator',
      title: 'Texas Hold\'em Showdown Winner & Kicker Resolver',
      anchor: 'Smarter.Poker Hold\'em Showdown Winner Calculator',
      height: 780
    },
    'mixed-game-placards': {
      path: '/tools/mixed-game-placards',
      title: 'Mixed-Game Rotation Tracker & Printable Table Placards',
      anchor: 'Smarter.Poker Mixed-Game Rotation & Table Placards',
      height: 800
    },
    'poker-iq-test': {
      path: '/tools/poker-iq-test',
      title: '10-Question Quantitative GTO Poker IQ Diagnostic Test',
      anchor: 'Smarter.Poker GTO Poker IQ Test',
      height: 820
    },
    'geometric-bet-calculator': {
      path: '/tools/geometric-bet-calculator',
      title: 'Geometric Bet Sizing (2e & 3e) Street Calculator',
      anchor: 'Smarter.Poker Geometric Bet Sizing Calculator',
      height: 780
    },
    'late-reg-calculator': {
      path: '/tools/late-reg-calculator',
      title: 'Tournament Late-Registration ICM & Equity Boost Calculator',
      anchor: 'Smarter.Poker Late-Registration ICM Calculator',
      height: 780
    },
    'mtt-grind-planner': {
      path: '/tools/mtt-grind-planner',
      title: 'MTT Sunday Grind Schedule, ABI & Bankroll Planner',
      anchor: 'Smarter.Poker MTT Grind & ABI Planner',
      height: 800
    },
    'plo-outs-calculator': {
      path: '/tools/plo-outs-calculator',
      title: 'PLO4 & PLO5 Straight Wrap Outs & Nut Equity Calculator',
      anchor: 'Smarter.Poker PLO Wrap & Outs Calculator',
      height: 780
    },
    'poker-trip-planner': {
      path: '/tools/poker-trip-planner',
      title: 'Poker Trip, Travel Overhead & Breakeven EV Planner',
      anchor: 'Smarter.Poker Festival Trip & Overhead Planner',
      height: 800
    },
    'shot-clock': {
      path: '/tools/shot-clock',
      title: 'TDA Tournament Shot Clock & Time-Bank Manager',
      anchor: 'Smarter.Poker TDA Tournament Shot Clock',
      height: 760
    },
    'table-selection-calculator': {
      path: '/tools/table-selection-calculator',
      title: 'Live Cash Game Table Selection & Winrate Multiplier Calculator',
      anchor: 'Smarter.Poker Live Table Selection Calculator',
      height: 780
    },
    'winrate-confidence-calculator': {
      path: '/tools/winrate-confidence-calculator',
      title: 'Poker Winrate Confidence Interval (70% / 95% / 99%) Calculator',
      anchor: 'Smarter.Poker Winrate Confidence Calculator',
      height: 780
    },
    'multiway-all-in-calculator': {
      path: '/tools/multiway-all-in-calculator',
      title: 'Multiway All-In EV & Side Pot Equity Calculator',
      anchor: 'Smarter.Poker Multiway All-In EV Calculator',
      height: 780
    },
    'mystery-bounty-tracker': {
      path: '/tools/mystery-bounty-tracker',
      title: 'Live Day-2 Mystery Bounty Envelope Removal Tracker',
      anchor: 'Smarter.Poker Mystery Bounty Envelope Tracker',
      height: 780
    },
    'bubble-factor-calculator': {
      path: '/tools/bubble-factor-calculator',
      title: 'Final Table Pairwise ICM Bubble Factor & Equity Matrix',
      anchor: 'Smarter.Poker Final Table Bubble Factor Matrix',
      height: 800
    },
    'bluff-catching-calculator': {
      path: '/tools/bluff-catching-calculator',
      title: 'River Bluff-Catching, Card-Removal Blockers & MDF Solver',
      anchor: 'Smarter.Poker River Bluff-Catching Solver',
      height: 760
    },
    'multi-street-ev-calculator': {
      path: '/tools/multi-street-ev-calculator',
      title: 'Multi-Street Double & Triple-Barrel Fold-Equity EV Solver',
      anchor: 'Smarter.Poker Multi-Street Barrel EV Solver',
      height: 780
    },
    'heads-up-push-fold-calculator': {
      path: '/tools/heads-up-push-fold-calculator',
      title: 'Heads-Up & 3-Max Spin Push/Fold Nash Equilibrium Solver',
      anchor: 'Smarter.Poker Heads-Up Push/Fold Nash Solver',
      height: 820
    },
    'blind-vs-blind-calculator': {
      path: '/tools/blind-vs-blind-calculator',
      title: 'Blind-Vs-Blind (SB Vs. BB) Limp, Open & 3-Bet Matrix Explorer',
      anchor: 'Smarter.Poker Blind-Vs-Blind SB Vs. BB Explorer',
      height: 820
    },
    'shot-taking-calculator': {
      path: '/tools/shot-taking-calculator',
      title: '2-Tier Bankroll Shot-Taking & Move-Down Stop-Loss Planner',
      anchor: 'Smarter.Poker Bankroll Shot-Taking Planner',
      height: 760
    },
    'warmup-cooldown-routine': {
      path: '/tools/warmup-cooldown-routine',
      title: 'Interactive Poker Pre-Session Warmup & Post-Session Cooldown Tool',
      anchor: 'Smarter.Poker Pre-Session Warmup & Cooldown Tool',
      height: 800
    },
    'home-game-director': {
      path: '/tools/home-game-director',
      title: 'Live Home Game Tournament Director Clock & Payout Console',
      anchor: 'Smarter.Poker Home Game Tournament Director',
      height: 800
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

    // Mount inline mini-preview popovers for <span data-smarter-poker-tooltip="pot-odds-calculator">
    var tooltipNodes = document.querySelectorAll('[data-smarter-poker-tooltip]');
    for (var j = 0; j < tooltipNodes.length; j++) {
      var trigger = tooltipNodes[j];
      if (trigger.getAttribute('data-sp-tooltip-mounted') === 'true') continue;
      (function (el) {
        var tKey = String(el.getAttribute('data-smarter-poker-tooltip') || 'pot-odds-calculator').trim().toLowerCase();
        var tSpec = WIDGET_REGISTRY[tKey] || WIDGET_REGISTRY['pot-odds-calculator'];
        var tPartner = sanitizeHost(el.getAttribute('data-partner') || defaultHost);
        var tLanderSuffix = tPartner ? '?utm_source=' + encodeURIComponent(tPartner) + '&utm_medium=embed-tooltip' : '';
        var tEmbedSuffix = tPartner ? '&utm_source=' + encodeURIComponent(tPartner) + '&utm_medium=embed-tooltip' : '';

        el.style.position = el.style.position || 'relative';
        el.style.display = el.style.display || 'inline-block';
        el.style.borderBottom = el.style.borderBottom || '1px dashed #38bdf8';
        el.style.color = el.style.color || '#38bdf8';
        el.style.cursor = 'pointer';
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', tSpec.title + ' Inline Preview');

        var popover = null;

        function openPopover() {
          if (popover) return;
          popover = document.createElement('div');
          popover.setAttribute('data-sp-tooltip-popover', tKey);
          popover.style.position = 'absolute';
          popover.style.zIndex = '99999';
          popover.style.left = '0';
          popover.style.top = '100%';
          popover.style.marginTop = '8px';
          popover.style.width = '360px';
          popover.style.background = '#090e1a';
          popover.style.border = '1px solid #38bdf8';
          popover.style.borderRadius = '12px';
          popover.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.65)';
          popover.style.padding = '10px';
          popover.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';

          var miniFrame = document.createElement('iframe');
          miniFrame.src = 'https://smarter.poker' + tSpec.path + '?embed=true' + tEmbedSuffix;
          miniFrame.width = '100%';
          miniFrame.height = '420';
          miniFrame.setAttribute('frameborder', '0');
          miniFrame.setAttribute('loading', 'lazy');
          miniFrame.setAttribute('title', tSpec.title);
          miniFrame.style.border = '0';
          miniFrame.style.borderRadius = '8px';
          miniFrame.style.display = 'block';

          var bar = document.createElement('div');
          bar.style.display = 'flex';
          bar.style.justifyContent = 'space-between';
          bar.style.alignItems = 'center';
          bar.style.marginTop = '8px';
          bar.style.fontSize = '11px';

          var anchorLink = document.createElement('a');
          anchorLink.href = 'https://smarter.poker' + tSpec.path + tLanderSuffix;
          anchorLink.target = '_blank';
          anchorLink.rel = 'noopener';
          anchorLink.style.color = '#38bdf8';
          anchorLink.style.textDecoration = 'none';
          anchorLink.style.fontWeight = '700';
          anchorLink.textContent = tSpec.anchor;

          var closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.textContent = 'Close';
          closeBtn.style.background = 'transparent';
          closeBtn.style.border = '1px solid rgba(148, 163, 184, 0.35)';
          closeBtn.style.color = '#cbd5e1';
          closeBtn.style.borderRadius = '4px';
          closeBtn.style.padding = '2px 7px';
          closeBtn.style.fontSize = '10px';
          closeBtn.style.cursor = 'pointer';
          closeBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            closePopover();
          });

          bar.appendChild(anchorLink);
          bar.appendChild(closeBtn);
          popover.appendChild(miniFrame);
          popover.appendChild(bar);
          el.appendChild(popover);
        }

        function closePopover() {
          if (popover && popover.parentNode) {
            popover.parentNode.removeChild(popover);
          }
          popover = null;
        }

        el.addEventListener('mouseenter', openPopover);
        el.addEventListener('mouseleave', closePopover);
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (popover) {
            closePopover();
          } else {
            openPopover();
          }
        });
        el.setAttribute('data-sp-tooltip-mounted', 'true');
      })(trigger);
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
