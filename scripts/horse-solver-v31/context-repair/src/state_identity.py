"""Complete exact game key, invariant to flop order and suit isomorphism."""
import hashlib,itertools,json,re

def canonical_flop(board):
 if not isinstance(board,str) or not re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3}',board):raise ValueError('invalid flop')
 cards=[board[i:i+2] for i in range(0,6,2)]
 if len(set(cards))!=3:raise ValueError('duplicate flop card')
 return min(''.join(sorted(c[0]+'cdhs'[p.index(c[1])] for c in cards)) for p in itertools.permutations('cdhs'))
def context_key(s):
 return json.dumps({k:v for k,v in s.items() if k not in ('scenario_id','depth_bucket','purpose','flop_board')},sort_keys=True,separators=(',',':'))
def game_key(s):
 state={k:v for k,v in s.items() if k not in ('scenario_id','depth_bucket','purpose')};state['flop_board']=canonical_flop(state['flop_board'])
 return hashlib.sha256(json.dumps(state,sort_keys=True,separators=(',',':')).encode()).hexdigest()
