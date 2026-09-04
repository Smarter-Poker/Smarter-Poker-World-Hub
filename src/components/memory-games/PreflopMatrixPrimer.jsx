/**
 * PreflopMatrixPrimer: the always-visible "how to read the matrix" panel on
 * the Preflop Charts menu.
 *
 * WHY (mobile phase 2): the page tutorial's Reading The Matrix, Actions And
 * Colours, Build Your Range and Submit And Score steps point at the matrix,
 * the action legend and the Submit button, and those only exist once a game
 * is running. The tour opens on the menu (hidden in the hamburger, offered
 * once by the prompt), so the menu needs real elements to ring. This panel
 * is those elements: a genuine 13x13 thumbnail with the pairs / suited /
 * offsuit regions coloured, the six action colours, and the four grading
 * colours. It is useful on its own as a legend, which is why it is a menu
 * section and not a tutorial-only prop.
 *
 * Targets: data-tutorial="matrix" (the thumbnail), "legend" (the action
 * colours), "submit" (the grading key). In a live game the same three names
 * sit on the real matrix, action buttons and Submit Range button; the two
 * screens never render together, so a name is never duplicated in the DOM.
 */
import { Grid3X3, Palette, Send } from 'lucide-react';
import { PreflopStaticGrid } from './PreflopRangeMatrix';

const GRADE_KEY = [
  { state: 'correct', label: 'Correct', detail: 'Right Hand, Right Action' },
  { state: 'missed', label: 'Missed', detail: 'Solver Hand Left Unmarked' },
  { state: 'extra', label: 'Extra', detail: 'Hand Added Outside The Range' },
  { state: 'wrong', label: 'Wrong Action', detail: 'Right Hand, Different Action' },
];

export default function PreflopMatrixPrimer({ ranks, getHandName, actionColors }) {
  return (
    <section className="preflop-primer" aria-labelledby="preflop-primer-title">
      <div className="preflop-primer-heading">
        <span className="preflop-panel-kicker"><Grid3X3 size={14} aria-hidden /> RANGE PRIMER</span>
        <h2 id="preflop-primer-title">How To Read The Matrix</h2>
        <p>Rows And Columns Are Card Ranks. Pairs Sit On The Diagonal, Suited Hands Above It, Offsuit Hands Below It.</p>
      </div>

      <div className="preflop-primer-body">
        <div className="preflop-primer-matrix" data-tutorial="matrix">
          <PreflopStaticGrid
            ranks={ranks}
            getHandName={getHandName}
            ariaLabel="Example 13 by 13 matrix with pairs on the diagonal, suited hands above and offsuit hands below"
          />
          <div className="preflop-primer-regions" aria-label="Matrix regions">
            <span data-region="pair"><i aria-hidden /> Pairs On The Diagonal</span>
            <span data-region="suited"><i aria-hidden /> Suited Above</span>
            <span data-region="offsuit"><i aria-hidden /> Offsuit Below</span>
          </div>
        </div>

        <div className="preflop-primer-keys">
          <div className="preflop-primer-legend" data-tutorial="legend" aria-label="Action colours">
            <div className="preflop-primer-key-title"><Palette size={14} aria-hidden /> Actions And Colours</div>
            <div className="preflop-primer-swatches">
              {Object.entries(actionColors).map(([action, { bg, border, label }]) => (
                <span key={action} style={{ '--action-color': border, '--action-fill': bg }}>
                  <i aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="preflop-primer-score" data-tutorial="submit" aria-label="How a submitted range is scored">
            <div className="preflop-primer-key-title"><Send size={14} aria-hidden /> Submit And Score</div>
            <p>Your Score Is The Exact Overlap With The Solver Range. Eighty Five Percent Passes A Level.</p>
            <div className="preflop-primer-grades">
              {GRADE_KEY.map((item) => (
                <span key={item.state} data-feedback={item.state}>
                  <i aria-hidden />
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
