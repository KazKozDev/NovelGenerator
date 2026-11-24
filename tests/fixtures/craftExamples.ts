import { authorArchitecture } from './authorArchitecture';
import type { AuthorArchitecture } from '../../utils/novel/craft/types';

/** Hand-authored mechanics examples; these are not claimed as live model prose. */
export function craftExamples(): Record<string, AuthorArchitecture> {
  const thriller = authorArchitecture();
  thriller.world.rules.push({ id: 'W2', rule: 'The hearing begins in ten minutes.', limit: 'The demolition cannot be delayed privately.', cost: 'Evidence must be made public now.' });
  thriller.graph.scenes[0].optionsAfter = ['Enter under her own name.'];
  thriller.graph.scenes[1].optionsAfter = ['Testify publicly; retreat is blocked.'];
  thriller.graph.scenes[2].optionsAfter = ['Face dismissal after the exposure.'];

  const testing = authorArchitecture();
  testing.characters.characters[0].arc = 'testing';
  testing.characters.characters[0].beliefOrCode = 'A public record must remain true even when my family suffers.';
  testing.characters.characters[0].finalChoice = 'Testify against her employer without concealing her own intrusion.';
  testing.concept.ending.internalOutcome = 'Her code survives; her institutional standing does not.';

  const mystery = authorArchitecture();
  mystery.contract.genre = 'mystery';
  mystery.contract.genrePromise = 'A fair physical reconstruction of the staged drowning.';
  mystery.concept.thematicQuestion = 'Will she expose a truth that also harms her family?';
  mystery.concept.ending.action = 'Demonstrate the jammed emergency release at the public hearing.';
  mystery.world.events.unshift({ id: 'E0', timeline: 'T1', time: 'Wednesday 20:00', location: 'Pump house', actor: 'C2', intention: 'Silence the organizer.', action: 'Cole wedges the emergency release with a brass shim and opens the flood gate while the organizer is below.', prerequisites: [], access: 'His maintenance key opens the control cage.', means: 'The disabled release prevents escape; the logged gate cycle floods the chamber.', outcome: 'The organizer drowns during the scheduled flushing cycle.', traces: ['Brass shavings in the release.', 'A gate-cycle log with an altered timestamp.'], dependsOn: [] });
  mystery.world.events[1].dependsOn = ['E0'];
  mystery.graph.scenes[0].sceneContract.action = 'Mara finds brass shavings in the release while Cole watches.';
  mystery.graph.scenes[1].sceneContract.action = 'Mara compares the gate log with the independent tide clock.';
  mystery.graph.scenes[2].sceneContract.action = 'Mara fits the shim into the release and demonstrates how Cole trapped the organizer.';
  mystery.revelations.facts[1].truth = 'A brass shim disabled the release during the logged flood cycle.';
  mystery.revelations.facts[1].acquisitions[0].action = 'Compare physical shavings and the independent clock.';
  mystery.revelations.facts[1].mode = 'mystery';
  mystery.revelations.facts[1].readerEvidence = [{ scene: 'SC1', event: 'E1', interpretation: 'Ordinary maintenance debris.' }, { scene: 'SC2', event: 'E2', interpretation: 'A deliberately jammed release explains the discrepancy.' }];
  mystery.payoffs.setups[0] = { id: 'G1', kind: 'physical clue', name: 'Brass shavings', neededFor: 'SC3', appearances: [{ scene: 'SC1', role: 'setup', action: 'She brushes the shavings onto a folded form.', interpretation: 'Routine wear.' }, { scene: 'SC2', role: 'reminder', action: 'She compares them with a clean release.', interpretation: 'The damage was deliberate.' }, { scene: 'SC3', role: 'payoff', action: 'The fitted shim reproduces the jam.', interpretation: 'Physical murder mechanism.' }], changedMeaning: 'Maintenance residue becomes evidence of an intentional trap.' };

  const romance = authorArchitecture();
  romance.contract.genre = 'romance'; romance.contract.genrePromise = 'Earned intimacy and a hopeful commitment.';
  romance.characters.characters[0].role = 'Print-shop owner'; romance.characters.characters[1].role = 'Printmaker returning from abroad';
  romance.characters.characters[0].arc = 'positive'; romance.characters.characters[0].want = 'Keep the family print shop without depending on Cole.';
  romance.characters.characters[0].beliefOrCode = 'Depending on someone always ends in abandonment.';
  romance.characters.characters[0].finalChoice = 'Offer Cole an equal partnership instead of controlling the shop alone.';
  romance.characters.characters[1].want = 'Leave for a fellowship without repeating his father’s broken promises.';
  romance.opposition.agent = 'Conflicting commitments'; romance.opposition.goal = 'The fellowship deadline and unpaid lease pull the couple apart.';
  romance.opposition.worldview = 'A fresh start seems safer than depending on someone.'; romance.opposition.resources = ['An expiring fellowship offer.']; romance.opposition.limits = ['The lease must be signed honestly by both partners.'];
  romance.opposition.steps[0] = { id: 'O1', event: 'E2', trigger: 'The hidden lease notice comes to light.', knowledgeRequired: ['The rent is overdue.'], action: 'Cole refuses to sign under false pretenses.', consequence: 'Nora must offer equal access to the accounts.', possibleFailure: 'Honesty can restore their trust.' };
  romance.world.rules = [{ id: 'W1', rule: 'Both partners must sign the lease by noon.', limit: 'Nora cannot cover the deposit alone.', cost: 'Cole must choose between the shop and a fellowship.' }];
  romance.world.places = [{ id: 'L1', constraints: ['The press needs two people to align it.'], dramaticFunction: 'Shared physical work permits intimacy before the hidden debt breaks trust.' }];
  romance.world.resources = [{ id: 'R1', owner: 'C1', available: true, description: 'The remaining lease deposit.' }];
  const actions = ['Nora and Cole repair a press together and admit why the shop matters to each of them.', 'Nora conceals the overdue lease; Cole finds it and refuses another relationship built on half-truths.', 'Nora shows the full accounts and offers an equal lease; Cole chooses the partnership and they sign together.'];
  const outcomes = ['Trust and attraction grow through shared work.', 'Trust breaks because control replaces honesty.', 'They choose an honest partnership and a hopeful future.'];
  romance.graph.scenes.forEach((s, i) => { s.sceneContract.action = actions[i]; s.outcome = outcomes[i]; s.goal = i === 2 ? 'Offer an honest shared future.' : 'Protect the shop without exposing her need.'; s.sceneContract.internal = 'Desire for closeness versus fear of dependence.'; s.sceneContract.interpersonal = 'Nora wants control; Cole wants equal trust.'; s.sceneContract.location = 'The family print shop'; s.resourceChanges = i === 2 ? [{ resource: 'R1', available: false, reason: 'They pay the deposit together.' }] : []; romance.world.events[i].action = actions[i]; romance.world.events[i].outcome = outcomes[i]; romance.world.events[i].location = s.sceneContract.location; romance.world.events[i].access = 'They are both entitled to enter the shop.'; romance.world.events[i].means = 'Shared work, the accounts and a jointly signed lease.'; romance.world.events[i].traces = ['The lease and the open accounts.']; });
  romance.revelations.facts = [{ id: 'F0', truth: 'The lease deposit is overdue.', initialKnownBy: ['C1'], acquisitions: [{ character: 'C2', scene: 'SC2', action: 'Cole reads the overdue notice.', evidenceEvent: 'E2' }], readerEvidence: [{ scene: 'SC1', event: 'E1', interpretation: 'Nora turns the overdue notice facedown while they work.' }, { scene: 'SC2', event: 'E2', interpretation: 'The debt was concealed from Cole.' }], reveal: 'SC1', mode: 'suspense' }];
  romance.payoffs.setups[0] = { id: 'G1', kind: 'relationship action', name: 'The shared press alignment', neededFor: 'SC3', appearances: [{ scene: 'SC1', role: 'setup', action: 'They align the press together.', interpretation: 'Working together feels possible.' }, { scene: 'SC3', role: 'payoff', action: 'They return to the press after signing equal terms.', interpretation: 'Physical partnership now rests on trust.' }], changedMeaning: 'Shared craft becomes chosen commitment.' };
  romance.concept.ending = { action: actions[2], cost: 'She gives up unilateral control; he gives up the fellowship.', externalOutcome: 'The shop has a viable shared lease.', internalOutcome: 'They commit to a hopeful relationship.' };
  romance.promises.promises[0].expectation = 'Can they choose intimacy without concealing what it costs?';
  romance.promises.promises[0].payoff.action = actions[2]; romance.promises.promises[0].payoff.consequence = outcomes[2];
  return { mystery, thriller, testing, romance };
}
