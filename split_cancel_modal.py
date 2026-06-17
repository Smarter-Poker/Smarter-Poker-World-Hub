import re

with open('pages/hub/settings.js', 'r') as f:
    lines = f.readlines()

# Lines to extract: 2515 to 2853
start_idx = 2514 # 0-indexed, so line 2515 is index 2514
end_idx = 2852   # line 2853 is index 2852

modal_lines = lines[start_idx:end_idx]

# Remove the extracted lines from settings.js
new_lines = lines[:start_idx] + [
    "            {/* VIP Cancellation Modal */}\n",
    "            {showCancelModal && (\n",
    "                <CancelVipModal\n",
    "                    showCancelModal={showCancelModal}\n",
    "                    setShowCancelModal={setShowCancelModal}\n",
    "                    cancelStep={cancelStep}\n",
    "                    setCancelStep={setCancelStep}\n",
    "                    cancelReason={cancelReason}\n",
    "                    setCancelReason={setCancelReason}\n",
    "                    cancelOtherText={cancelOtherText}\n",
    "                    setCancelOtherText={setCancelOtherText}\n",
    "                    cancelLoading={cancelLoading}\n",
    "                    setCancelLoading={setCancelLoading}\n",
    "                    cancelFeedback={cancelFeedback}\n",
    "                    setCancelFeedback={setCancelFeedback}\n",
    "                    user={user}\n",
    "                />\n",
    "            )}\n"
] + lines[end_idx:]

# Find where to insert the dynamic import (just after dynamic is imported)
import_idx = 0
for i, line in enumerate(new_lines):
    if line.startswith("export default function SettingsPage()"):
        import_idx = i - 1
        break

new_lines.insert(import_idx, "const CancelVipModal = dynamic(() => import('../../src/components/settings/modals/CancelVipModal'), { ssr: false });\n")

# Need to ensure 'dynamic' is imported
has_dynamic = any("import dynamic" in l for l in new_lines)
if not has_dynamic:
    new_lines.insert(0, "import dynamic from 'next/dynamic';\n")

with open('pages/hub/settings.js', 'w') as f:
    f.writelines(new_lines)

# Now create the new CancelVipModal.js component
modal_content = "".join(modal_lines)

# Strip the leading outer `{showCancelModal && (` and trailing `)}`
# To be safe, we just wrap it properly.
modal_content = modal_content.strip()
if modal_content.startswith("{/* VIP Cancellation Modal */}"):
    modal_content = modal_content.replace("{/* VIP Cancellation Modal */}", "", 1).strip()
if modal_content.startswith("{showCancelModal && ("):
    modal_content = modal_content[len("{showCancelModal && ("):].strip()
if modal_content.endswith(")}"):
    modal_content = modal_content[:-2].strip()

new_component = f"""
import React from 'react';
import {{ getAccessToken }} from '../../../lib/authUtils';

export default function CancelVipModal({{
    showCancelModal, setShowCancelModal,
    cancelStep, setCancelStep,
    cancelReason, setCancelReason,
    cancelOtherText, setCancelOtherText,
    cancelLoading, setCancelLoading,
    cancelFeedback, setCancelFeedback,
    user
}}) {{
    return (
        {modal_content}
    );
}}
"""

import os
os.makedirs('src/components/settings/modals', exist_ok=True)
with open('src/components/settings/modals/CancelVipModal.js', 'w') as f:
    f.write(new_component.strip() + "\n")

print("Successfully extracted CancelVipModal.")
