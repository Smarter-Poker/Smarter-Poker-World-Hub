import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent/'src'))
from runtime import predict_batches
from models import predict

class Head:
    def __init__(self, column): self.column=column; self.calls=0
    def predict(self, x): self.calls+=1; return x[:, self.column]

class RuntimeContracts(unittest.TestCase):
    def model(self): return dict(feature_count=2, heads=[Head(0), Head(1)])
    def test_batches_preserve_numerical_results_and_order(self):
        m=self.model(); batches=[np.array([[.1,.9],[.7,.3]]),np.array([[.4,.6]])]
        expected=[predict(m,x) for x in batches]
        for h in m['heads']: h.calls=0
        actual=predict_batches(m,batches)
        for a,b in zip(actual,expected): np.testing.assert_array_equal(a,b)
        self.assertEqual([h.calls for h in m['heads']],[1,1])
    def test_empty_parts_and_empty_request_do_not_infer(self):
        m=self.model(); self.assertEqual(predict_batches(m,[]),[])
        result=predict_batches(m,[np.empty((0,2)),np.empty((0,2))])
        self.assertEqual([a.shape for a in result],[(0,2),(0,2)])
        self.assertEqual([h.calls for h in m['heads']],[0,0])
        result=predict_batches(m,[np.empty((0,2)),np.array([[.2,.8]]),np.empty((0,2))])
        self.assertEqual([a.shape for a in result],[(0,2),(1,2),(0,2)])
    def test_invalid_later_partition_refuses_before_any_inference(self):
        for bad in (np.zeros((2,3)),np.zeros(2),np.array([[np.nan,1.]]),np.array([[np.inf,1.]])):
            m=self.model()
            with self.assertRaises(ValueError): predict_batches(m,[np.array([[.2,.8]]),bad])
            self.assertEqual([h.calls for h in m['heads']],[0,0])
    def test_outputs_do_not_alias_inputs_or_other_partitions(self):
        m=self.model(); x=np.array([[.2,.8]]); a,b=predict_batches(m,[x,x])
        a[0,0]=99.; self.assertEqual(b[0,0],.2);self.assertEqual(x[0,0],.2)
    def test_zero_mass_and_nonfinite_model_output_still_refused(self):
        for x in (np.array([[0.,0.]]),):
            with self.assertRaises(ValueError): predict_batches(self.model(),[x])
        class Bad:
            def predict(self,x): return np.full(len(x),np.nan)
        with self.assertRaises(ValueError): predict_batches(dict(feature_count=2,heads=[Bad(),Bad()]),[np.array([[.2,.8]])])

if __name__=='__main__': unittest.main()
