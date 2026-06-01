// Merges hand-verified "Quick" summaries into public/companion.json as the first tab of
// each sub-phase, preserving each sub-phase's existing "rules" (and any "reactions") tab.
// Quick summaries are keyed by phase id -> array aligned to that phase's sub-phase order.
// Run: node scripts/merge-quick.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'public', 'companion.json');
const c = JSON.parse(await readFile(FILE, 'utf8'));

// Each entry: { name, blocks: [ {type:'steps',items:[...]}, {type:'callouts',items:[...]} ] }
const QUICK = {
  strategy: [
    { name: 'Start of Turn', blocks: [
      { type: 'steps', items: [
        "Resolve any 'start of turn' special rules on your units.",
        'Make any tests required at the start of the turn.',
        'Check scenario victory conditions before playing on, if required.',
        'Tidy up: remove stray casualties and reset loose dice.',
        'Ask your opponent any rules or magic item questions now.',
      ] },
    ] },
    { name: 'Command', blocks: [
      { type: 'steps', items: [
        'Choose a model (usually a character) that is not fleeing.',
        'State which Command special rule it will use, if any.',
        'Name affected unit(s), then make any required tests.',
        'Repeat for every eligible model with a Command special rule.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Once each', t: 'Unless stated otherwise, a model can use each special rule only once per Command sub-phase.' },
      ] },
    ] },
    { name: 'Conjuration', blocks: [
      { type: 'steps', items: [
        'Choose one of your Wizards that is not fleeing.',
        'Attempt to cast any Enchantment or Hex spells it knows.',
        'If cast successfully, the inactive player may attempt to dispel.',
        'Repeat for every Wizard in your army.',
      ] },
    ] },
    { name: 'Rally Fleeing Troops', blocks: [
      { type: 'steps', items: [
        'Identify each of your units that is currently fleeing.',
        'Make a Rally test for a chosen fleeing unit, testing against Leadership.',
        'If passed, the unit rallies and stops fleeing.',
        'If failed, the unit continues to flee.',
        'Repeat until every fleeing unit has tested to rally.',
      ] },
      { type: 'callouts', items: [
        { kind: 'faq', h: 'After rallying', t: 'A rallied unit may make a free reform, but cannot move further or shoot this turn unless stated.' },
      ] },
    ] },
  ],

  movement: [
    { name: 'Declare Charges', blocks: [
      { type: 'steps', items: [
        'Declare which units will charge, one at a time.',
        'Nominate an enemy unit as the target of each charge.',
        "Check the target is in the charging unit's forward arc.",
        'Confirm a charging model can see its target.',
        'Let the opponent declare a charge reaction for each charge.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Cannot charge', t: 'A unit that is fleeing, already engaged, or that rallied this turn cannot declare a charge.' },
        { kind: 'faq', h: 'Charge reactions', t: 'The target may Hold, Flee, or Stand & Shoot in response to a declared charge.' },
      ] },
    ] },
    { name: 'Charge Moves', blocks: [
      { type: 'steps', items: [
        "Make a Charge roll: roll 2D6 and add the unit's Movement.",
        'Move the charging unit into base contact with its target.',
        'Make a single wheel as needed to maximise models in contact.',
        'Align the units so the fighting ranks meet.',
        'If the roll is too short, the charge fails.',
      ] },
      { type: 'callouts', items: [
        { kind: 'eg', h: 'Maximum range', t: 'Maximum possible charge range equals the unit’s Movement characteristic plus 12.' },
        { kind: 'warn', h: 'Failed charge', t: 'A failed charger moves its full Charge roll distance straight ahead, then may not shoot this turn.' },
      ] },
    ] },
    { name: 'Compulsory Moves', blocks: [
      { type: 'steps', items: [
        'Resolve all compulsory moves before any remaining (free) moves.',
        'Move fleeing units first, then other compulsory movers.',
        'Move each unit as directed by its special rule.',
        'Resolve your compulsory moves in any order you choose.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Fleeing units', t: 'Units that failed to rally this turn continue to flee during this sub-phase.' },
      ] },
    ] },
    { name: 'Remaining Moves', blocks: [
      { type: 'steps', items: [
        'Move any units that have not yet moved this turn.',
        'Move each unit up to its Movement characteristic.',
        'March at up to double Movement if no enemy is nearby.',
        'Reform or change formation as permitted instead of moving.',
        'Cast Conveyance spells during this sub-phase.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'No marching near enemy', t: 'A unit cannot march if there is an enemy unit within 8" at the start of its move.' },
        { kind: 'faq', h: 'Marching and shooting', t: 'A unit that marches cannot shoot later this turn.' },
      ] },
    ] },
  ],

  shooting: [
    { name: 'Choose Unit & Target', blocks: [
      { type: 'steps', items: [
        'Choose one of your units that is able to shoot.',
        "Check the firing models' line of sight to the enemy.",
        "Check each weapon's range to the target.",
        'Declare which enemy unit is the target.',
        'Determine how many models can shoot.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: "We Can't All Shoot!", t: 'Only models with line of sight and the target in range may fire.' },
      ] },
    ] },
    { name: 'Roll To Hit', blocks: [
      { type: 'steps', items: [
        'Roll a D6 for each shot being fired.',
        "Compare each roll to the firing model's Ballistic Skill.",
        'Apply any To Hit modifiers to the rolls.',
        'Set aside each dice that scores a hit.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Move or long range', t: 'Apply -1 to hit for moving and shooting, and -1 for firing at long range.' },
        { kind: 'warn', h: 'Cover', t: 'A target behind partial cover gives -1 to hit; full cover gives -2 to hit.' },
      ] },
    ] },
    { name: 'Roll To Wound & Saves', blocks: [
      { type: 'steps', items: [
        'Roll to wound for each hit, comparing Strength to Toughness.',
        'Set aside each dice that scores a wound.',
        'Let the target roll armour saves against each wound.',
        'Apply the Armour Piercing modifier to the save.',
        'Let the target attempt any Ward saves that apply.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Too Tough to Wound', t: 'If the wound roll needed is higher than 6, the target cannot be wounded.' },
      ] },
    ] },
    { name: 'Remove Casualties & Panic', blocks: [
      { type: 'steps', items: [
        'Total the unsaved wounds inflicted on the target.',
        'Remove one model per unsaved wound as a casualty.',
        'Check whether the unit must take a Panic test.',
        "Take the Panic test against the unit's Leadership.",
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Panic trigger', t: 'A unit that loses 25% or more of its models tests for Panic.' },
        { kind: 'faq', h: 'Fall Back or Flee', t: 'A unit that fails its Panic test will Fall Back in Good Order or Flee.' },
      ] },
    ] },
    { name: 'Special Cases', blocks: [
      { type: 'steps', items: [
        'Resolve Magic Missile and Magical Vortex spells as shooting attacks.',
        'Apply special rules for shooting into combat where allowed.',
        'Let extra ranks shoot when a rule permits it.',
        'Resolve automatic hits without rolling to hit.',
        'Apply hits that inflict multiple wounds.',
        'Remove models slain by instant kills.',
        'Resolve any other unusual attacks as described.',
      ] },
    ] },
  ],

  combat: [
    { name: 'Choose Combat & Who Fights', blocks: [
      { type: 'steps', items: [
        'Choose one combat to resolve from those engaged.',
        'Identify which models are in base contact with the enemy.',
        'Include the fighting rank: models in base contact may fight.',
        'Add supporting attacks from the rank directly behind.',
        'Resolve each chosen combat fully before picking another.',
      ] },
      { type: 'callouts', items: [
        { kind: 'faq', h: 'Supporting attacks', t: 'Models in the rank behind a fighting rank may make a single supporting attack.' },
      ] },
    ] },
    { name: 'Order of Attacks', blocks: [
      { type: 'steps', items: [
        'Count each model’s Attacks characteristic to find attacks made.',
        'Work out the order of attacks by Initiative, highest first.',
        'Resolve attacks in descending Initiative order.',
        'Roll simultaneously for models with the same Initiative.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Charging bonus', t: 'Models that charged this turn fight with a +1 Initiative bonus in the first round.' },
      ] },
    ] },
    { name: 'Multiple Units', blocks: [
      { type: 'steps', items: [
        'Determine which enemy units each model is in base contact with.',
        'Allocate each model’s attacks against units it touches.',
        'Divide attacks between multiple enemy units if in contact with several.',
        'Declare how attacks are split before rolling to hit.',
      ] },
    ] },
    { name: 'Roll To Hit', blocks: [
      { type: 'steps', items: [
        'Roll a D6 for each attack made.',
        "Compare the roll to the attacker's and defender's Weapon Skill.",
        'Apply any To Hit modifiers.',
        'Set aside each dice that scores a hit.',
      ] },
    ] },
    { name: 'Roll To Wound & Saves', blocks: [
      { type: 'steps', items: [
        'Roll to wound for each hit, comparing Strength to Toughness.',
        'Set aside each dice that scores a wound.',
        'Let the defender make armour saves against each wound.',
        'Apply the Armour Piercing modifier to the save.',
        'Let the defender attempt any Ward saves that apply.',
      ] },
    ] },
    { name: 'Remove Casualties', blocks: [
      { type: 'steps', items: [
        'Total the unsaved wounds inflicted on each unit.',
        'Remove one model per unsaved wound as a casualty.',
        'Remove casualties from the rear rank of the unit.',
        'Keep a count of wounds caused for the combat result.',
      ] },
      { type: 'callouts', items: [
        { kind: 'faq', h: 'Step forward', t: 'As front-rank models are slain, rear-rank models step forward to fill gaps.' },
      ] },
    ] },
    { name: 'Combat Result', blocks: [
      { type: 'steps', items: [
        "Total each side's combat result score.",
        'Add 1 point per unsaved wound inflicted.',
        'Add the Rank Bonus: +1 per extra rank up to the maximum.',
        'Add bonuses for a standard, flank or rear attack, and high ground.',
        'Compare totals; the higher score wins the combat.',
      ] },
      { type: 'callouts', items: [
        { kind: 'faq', h: 'Rank Bonus', t: 'Claim +1 per extra rank behind the first, up to a maximum set by troop type.' },
      ] },
    ] },
    { name: 'Result — Multiple Combats', blocks: [
      { type: 'steps', items: [
        'Total the combat result across all units on each side.',
        'Combine the wounds inflicted by every unit involved.',
        'Count each bonus once for the side, as described.',
        'Compare the combined scores to find the winning side.',
      ] },
    ] },
    { name: 'Break Test', blocks: [
      { type: 'steps', items: [
        'The side that lost the combat must take a Break test.',
        'Roll a Leadership test with a modifier equal to the result difference.',
        'If passed, the unit holds its nerve.',
        'If failed, the unit Breaks and Flees.',
      ] },
      { type: 'callouts', items: [
        { kind: 'warn', h: 'Modifier', t: 'Apply a penalty equal to the difference in the combat result scores.' },
      ] },
    ] },
    { name: 'Follow Up & Pursuit', blocks: [
      { type: 'steps', items: [
        'Resolve follow up moves when a beaten enemy gives ground.',
        'Pursue an enemy that Breaks and Flees from combat.',
        'Roll for pursuit distance as described in the rules.',
        'Move pursuers into contact, or overrun if no enemy remains.',
      ] },
      { type: 'callouts', items: [
        { kind: 'faq', h: 'Restrain or reform', t: 'A unit may attempt to restrain pursuit, and may reform instead of pursuing.' },
      ] },
    ] },
    { name: 'Special Cases', blocks: [
      { type: 'steps', items: [
        'Resolve Assailment spells cast during the Combat phase.',
        'Handle shrinking units that lose models mid-combat.',
        'Apply rules when no more foes remain in base contact.',
        'Resolve combats involving incomplete ranks or split profiles.',
        'Handle models fighting with different weapons.',
      ] },
    ] },
    { name: 'Terrain & Combat', blocks: [
      { type: 'steps', items: [
        'Note how terrain affects the units in this combat.',
        'Apply effects of open ground, hills and difficult terrain.',
        'Resolve combats fought across linear obstacles.',
        'Apply rules for dangerous or impassable terrain and woods.',
      ] },
    ] },
    { name: 'End of Turn', blocks: [
      { type: 'steps', items: [
        'Confirm all combats have been resolved.',
        "Resolve any 'end of turn' special rules or effects.",
        'End your turn and pass play to your opponent.',
      ] },
    ] },
  ],
};

let injected = 0;
const problems = [];
for (const phase of c.phases) {
  const quickList = QUICK[phase.id];
  if (!quickList) { problems.push(`no quick data for phase ${phase.id}`); continue; }
  phase.subs.forEach((sub, i) => {
    const q = quickList[i];
    if (!q || q.name !== sub.name) {
      problems.push(`mismatch ${phase.id}[${i}]: companion="${sub.name}" quick="${q ? q.name : '—'}"`);
      return;
    }
    // Drop any pre-existing quick tab, then prepend the new one. Keep rules/reactions/etc.
    const others = sub.tabs.filter((t) => t.id !== 'quick');
    sub.tabs = [{ id: 'quick', label: 'Quick', blocks: q.blocks }, ...others];
    injected++;
  });
}

if (problems.length) {
  console.error('PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}

await writeFile(FILE, JSON.stringify(c, null, 2) + '\n');
console.log(`Injected Quick tabs into ${injected} sub-phases across ${c.phases.length} phases.`);
