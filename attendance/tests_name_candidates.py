from unittest import TestCase
from types import SimpleNamespace as Obj
from attendance.services.name_candidates import similarity, suggest_candidates


class NameCandidateTests(TestCase):
    def test_joined_initial_and_actual_cohort_suffix(self):
        self.assertGreaterEqual(similarity('Tpradeep G2 26 -VLSI', 'Tummala Pradeep', ['G2-26', 'VLSI']), 90)

    def test_word_order(self):
        self.assertEqual(similarity('Pradeep Tummala', 'Tummala Pradeep'), 100)

    def test_typo_is_suggestion(self):
        self.assertGreaterEqual(similarity('Tummala Pradep', 'Tummala Pradeep'), 85)

    def test_unrelated_or_incomplete_names_not_confident(self):
        self.assertLess(similarity('Pradeep', 'Tummala Pradeep'), 70)
        self.assertLess(similarity('Ravi Kumar', 'Tummala Pradeep'), 70)
        self.assertLess(similarity('T P', 'Tummala Pradeep'), 90)

    def test_duplicate_names_remain_multiple_review_candidates(self):
        roster = {f'{i}@example.com': Obj(student=Obj(id=i, user=Obj(first_name='Tummala', last_name='Pradeep')))
                  for i in range(2)}
        result = suggest_candidates('Tpradeep G2 26 VLSI', roster, ['G2-26', 'VLSI'])
        self.assertEqual(len(result), 2)
        self.assertTrue(all(r['evidence'] == 'NAME_SIMILARITY_REQUIRES_REVIEW' for r in result))
