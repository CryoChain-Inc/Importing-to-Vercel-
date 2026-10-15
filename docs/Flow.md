## Summary

### Lots and buying

- A buyer commits to a whole lot in the current prototype. They can’t choose a
  smaller quantity or buy an individual farmer’s consignment.
- The 3,000 kg figure is the planned truck capacity, not a mandatory lot size.
  The workflow suggests lots of 2,700–3,000 kg, but that’s a planning target;
  the sample lot is 1,700 kg.
- A 500 kg lot is possible in the data model; there is no implemented minimum
  lot weight.
- One buyer commits to a lot. A lot may be gathered from several collection
  points through separate stops.
- The docs don’t clearly settle whether a truck can carry multiple lots. The
  domain model allows a route with stops assigned to different lots, but the
  workflow examples focus on one lot gathered across multiple stops.

### Collection points, stops, and routes

- A collection point is a permanent location where farmers bring produce.
- A stop is a visit to one collection point for a particular lot on a particular
  day.
- A route is the day’s ordered set of stops, assigned to a vehicle, driver, and
  agent.
- The docs describe Ops planning routes and stops, but don’t clearly specify an
  “operations manager” role or all of its controls. The prototype uses sample
  data and doesn’t provide full route or lot creation tools.
- The workflow proposes a GHS 6,200 minimum value per stop to cover estimated
  collection costs. This is a planning rule, not enforced in the prototype, and
  the docs contain differing route-size assumptions.

### Produce, grade, and price

- Farmer listings record crop and estimated kilograms at the published farm-gate
  price.
- The field agent weighs and grades each farmer’s produce individually, with a
  photo. Final farmer payment is based on recorded weight and grade.
- Buyers see a delivered price for the lot and commit to the full listed lot.
- A gap remains: buyer requirements can specify a target grade, but in the
  prototype the grade is captured during collection, after the buyer commits.

### Accounts and profiles

- The docs say Ops creates staff accounts for agents and drivers.
- Farmer collection-point changes aren’t specified, and the prototype has no
  profile flow for changing a collection point.
- Wallet-number changes require in-person verification by an agent, Ops
  approval, and a 24-hour hold. Remote changes aren’t allowed.
- Buyer onboarding requires corporate verification, business documents, and
  two-factor authentication. The docs don’t explicitly say whether Ops must
  approve each buyer.
- The prototype doesn’t implement staff invitations, buyer approval, or farmer
  profile editing.

### GPS

- The driver phone is meant to capture truck location in the background during
  transit.
- The agent’s location is meant to be recorded when weighing produce, but
  continuous live tracking of the agent isn’t specified.

### Short collection and buyer rejection

- For a short collection—for example, 300 kg weighed when 500 kg was listed—the
  agent records actual weights. Farmer payment uses the actual recorded amount;
  the farmer doesn’t owe money for the missing quantity.
- The docs don’t define whether the buyer must approve proceeding with a smaller
  lot, whether Ops can cancel or relist, or how to substitute another farmer.
- Ops may assign an uncaptured consignment to a lot, but a consignment’s lot
  assignment cannot change after capture. Since the buyer funds before
  collection, adding produce after commitment also raises questions about buyer
  approval and escrow adjustments.
- Any replacement from another collection point would require the route and the
  agent’s and driver’s manifests to be updated. The prototype has no
  reallocation or manifest-update tools.
- A buyer rejection puts the lot into dispute and holds escrow while Ops reviews
  evidence. For a partial rejection, the docs propose resolving matters per
  consignment so undisputed produce can be paid, but the exact payment rule
  remains undecided.
- The prototype can mark a lot disputed but doesn’t implement the full
  investigation or resolution process.
