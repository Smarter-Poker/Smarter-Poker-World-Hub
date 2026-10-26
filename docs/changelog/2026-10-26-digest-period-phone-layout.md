# Daily, weekly and monthly totals fit a phone

The new totals table overflowed a 375px viewport to 482px in native Chrome.
At phone widths each metric label now occupies its own line above the three
values. Desktop columns remain unchanged, numbers stay whole and all labels
remain visible. The same native check now reports375/375 and600/600.

Recovered the existing draft PR2565 browser fixtures into this delivery,
extending them with the new period table. The existing Global Footer workflow
runs Chromium/WebKit at375 and600px, including all938 roster members and
24 long breakdown labels. PR2565 can close as superseded after delivery.

Full long-label fixture initially measured717px at both375 and600px; restored
word wrapping on alert and metric labels as well. All four Chromium/WebKit
cases now pass, as do26 Node renderer/number tests and TypeScript.
