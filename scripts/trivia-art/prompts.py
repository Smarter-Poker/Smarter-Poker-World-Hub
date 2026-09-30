"""Destination intro prompts, Trivia Phase 4 (p4-art).

Pipeline (run from a scratch copy of this folder on an Apple-silicon Mac with
mflux 0.19.2; gen/ export/ refs/ are workspace folders, never committed):
  python3 prompts.py -> bash queue.sh "<ids>" "<seeds>" -> python3 export.py <id> <seed>
  -> python3 build.py <repo> -> python3 proof.py <repo> -> node art-cache-name.mjs

One master per family, in the modes-console-v1 art language (same style block,
positive-only wording: Z-Image-Turbo has no negative conditioning, so naming a
banned thing primes it). Each master must survive two crops: a 16:10 mobile
crop and a 2.4:1 desktop band, so the subject is held in the middle band.
Run: python3 prompts.py  (writes prompts/<id>.txt, prints sha256 per id)
"""
import hashlib, os
HERE = os.path.dirname(os.path.abspath(__file__))

STYLE = (
    "photoreal cinematic photograph, premium high-stakes casino realism, shot on a full-frame cinema camera "
    "with a prime lens, black-first composition set in a deep true-black environment. The whole palette is "
    "monochrome black, charcoal, graphite, brushed steel, polished chrome and cool silver-white, accented only by "
    "restrained electric blue light (#45adff). Materials: machined brushed steel, polished chrome, padded matte "
    "black leather with thin chrome trim, plain charcoal felt. Poker chips are only solid black, pure white-silver, "
    "or electric blue, each with white edge spots. Lighting: cool silver-white key light, restrained electric blue "
    "accents, deep shadows, high dynamic range, subtle film grain, sharp focus on the subject. Every surface is blank "
    "and unmarked. Wide cinematic composition with real depth; the essential subject sits in the middle band of the "
    "frame, inside the central 60 percent of the width and the central 55 percent of the height, with calm dark "
    "environment around it on every side."
)

SUBJECTS = {
 "lobby": "wide establishing photograph of a dark circular private game atrium seen from a low angle at floor level. A ring of eight identical machined brushed steel pedestals stands on a glossy black stone floor, each pedestal crowned with a softly glowing electric blue disc of light. Thin concentric rings of electric blue light are inlaid in the floor and connect the pedestals. In the centre a tall polished chrome column rises into the darkness, catching cool silver reflections. The far walls dissolve into deep black with faint vertical chrome ribs, and the floor mirrors every light.",
 "daily": "photograph at felt level of ten electric blue poker chips standing in a gentle curved row across plain black felt, evenly spaced, each lit from above by its own narrow shaft of cool silver-white light. The nearest chip, left of centre, is in sharp focus and the row curves away into soft focus. Behind them sits a small polished chrome box with its lid slightly raised, a soft electric blue glow spilling from the opening onto the felt. Far behind, a thin horizontal line of electric blue light glows at the edge of the darkness like the start of a new day.",
 "arcade": "close three-quarter photograph of a sleek matte black console panel with a row of five large round polished chrome push buttons, each ringed by a thin chrome bezel. The middle button is pressed down and glows bright electric blue from within, casting blue light across the panel, while the other four are dark with cool silver highlights. A short stack of electric blue poker chips and a short stack of white-silver chips sit at the panel's front edge, softly out of focus. Faint streaks of blue light race across the black background, fast and electric.",
 "history": "museum photograph of a single heirloom poker chip of polished chrome and black enamel resting on a small black velvet stand under a tall clear glass dome, lit by one narrow cool spotlight from above, the dome catching crisp silver highlights. Behind it, rows of empty glass vitrines on slim chrome legs recede into darkness down a long gallery, each vitrine base traced by a thin electric blue light line. Quiet, reverent atmosphere, very shallow depth of field.",
 "rules": "precise macro photograph at felt level of a thick polished chrome puck, a blank smooth disc the size of a large coin, resting exactly on a thin straight line of electric blue light that runs across plain black felt from the left edge toward the right. Beside the puck a short stack of black poker chips is squared perfectly, every edge aligned. In the foreground a padded matte black leather table rail with thin chrome trim curves across the lower corner, softly out of focus. Order and precision, clean geometry, deep black background.",
 "pro": "macro photograph of a polished chrome jeweler's loupe lying on plain black felt, its round glass lens magnifying the white edge spots of a single electric blue poker chip beneath it, the lens rim catching a bright silver highlight. Behind, a soft out-of-focus bokeh of cool silver and electric blue points of light floats in the darkness. Focused, analytical mood, very shallow depth of field.",
 "mtt": "low-angle macro photograph of a skyline of poker chip towers rising from plain black felt: columns of black, white-silver and electric blue chips of increasing height climb from left to right like skyscrapers, the tallest column in sharp focus just right of centre with a small polished chrome trophy cup standing on its top, catching a cool spotlight. Soft blue haze and bokeh fill the deep black background.",
 "cash": "three-quarter photograph of a polished chrome chip rack tray resting on plain black felt, its long rounded slots filled with neat rows of black, white-silver and electric blue poker chips, one slot empty. In front of the rack a single electric blue chip stands upright on its edge in sharp focus. Cool silver key light glides along the chrome with electric blue reflections, deep black background.",
 "icm": "photograph of three polished chrome cylinders of descending height standing side by side on plain black felt, the tallest one left of centre, the next one middle height, the last one short. Each cylinder carries a neat stack of poker chips on its flat top, the tallest cylinder the tallest stack, the others progressively smaller. A thin electric blue light line traces the top rim of every cylinder. Cool silver spotlight from above, deep black background with soft blue haze.",
 "gto": "photograph of perfect mirror symmetry on a glossy black glass table: two identical towers of black, white-silver and electric blue poker chips stand at equal distance on either side of a thin vertical beam of electric blue light that rises from the table surface, and a small polished chrome sphere floats exactly on the beam line between them. Every element is doubled by a crisp reflection in the black glass. Balanced, mathematical calm, deep black background.",
 "endless": "photograph at felt level of a perfectly straight row of electric blue poker chips standing upright on their edges like dominoes, evenly spaced, running from a sharp foreground chip near the camera toward a distant vanishing point across an endless plain of black felt. A faint cool horizon glow of electric blue light sits at the vanishing point. Long perspective, very shallow depth of field in the foreground.",
 "mixed": "photograph of seven clear glass cylinders with polished chrome caps standing in a gentle arc on plain black felt, each cylinder holding a neat stack of poker chips in a different pattern of black, white-silver and electric blue, each lit softly from below by an electric blue glow. The middle cylinder is in sharp focus and the others fall away into soft focus on both sides. Deep black background.",
 "survival": "dramatic photograph of a single tall narrow brushed steel pillar rising from a still, glossy black floor, one electric blue poker chip balanced upright on its edge at the very top, lit by one hard cool spotlight from above. Around the base of the pillar lie scattered fallen black chips, half in shadow. The surrounding space is vast and dark with a faint blue haze. Last one standing, tense and quiet.",
 "time-attack": "photograph of a polished chrome and clear glass hourglass standing on plain black felt, its falling sand made of fine glowing electric blue particles, the upper bulb almost empty and the lower bulb nearly full. Thin streaks of electric blue light race around the hourglass in a fast arc, motion blurred, and a few small black and white-silver poker chips lie scattered at its base. Urgent and fast, deep black background.",
 "pvp": "high-speed macro photograph of two poker chips colliding edge to edge in mid-air above plain black felt, one electric blue and one solid black, frozen at the instant of impact, a burst of fine blue-white sparks and light fragments exploding outward from the contact point. The left side of the frame is lit with electric blue rim light and the right side with a crimson red rim light (#ff5b6e). Head-to-head duel energy, deep black background.",
 "tournaments": "photograph of a vast black wall in a dark arena on which thin lines of electric blue light form a large symmetric knockout bracket tree, branching lines converging from the far left and far right toward one bright point at the top centre. Below the meeting point a tall polished chrome trophy cup stands on a black pedestal on a glossy black stage floor that reflects the glowing lines. Epic nightly championship atmosphere.",
}

SUFFIX = {
 "pvp": " The right-hand rim light is crimson red (#ff5b6e) by design.",
 "tournaments": " Gold (#ffd700) appears only on a genuinely gold object.",
}

def prompt_for(i):
    return f"Subject: {SUBJECTS[i]}\n\nStyle: {STYLE}{SUFFIX.get(i, '')}\n"

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "prompts"), exist_ok=True)
    for i in SUBJECTS:
        p = prompt_for(i)
        with open(os.path.join(HERE, "prompts", f"{i}.txt"), "w") as f:
            f.write(p)
        print(i, hashlib.sha256(p.encode()).hexdigest()[:16], len(p))
