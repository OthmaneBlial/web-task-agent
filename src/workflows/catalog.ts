export interface WorkflowCatalogDomain {
  id: string;
  title: string;
  description: string;
  searchContext: string;
  sampleTopic: string;
}

export interface WorkflowCatalogMission {
  id: string;
  title: string;
  description: string;
  researchFocus: string;
  deliverables: string[];
  querySuffixes: string[];
}

export interface WorkflowCatalogEntry {
  id: string;
  title: string;
  category: string;
  description: string;
  domain: WorkflowCatalogDomain;
  mission: WorkflowCatalogMission;
  examplePath: string;
}

export const WORKFLOW_CATALOG_DOMAINS: WorkflowCatalogDomain[] = [
  { id: "ai-developer-tools", title: "AI Developer Tools", description: "coding assistants, agent harnesses, IDE extensions, and engineering workflows", searchContext: "AI developer tools", sampleTopic: "code review agents for TypeScript teams" },
  { id: "api-platforms", title: "API Platforms", description: "API design, observability, gateways, developer portals, and integration tooling", searchContext: "API platform developers", sampleTopic: "API observability for small platform teams" },
  { id: "cloud-devops", title: "Cloud and DevOps", description: "deployment, CI/CD, infrastructure, reliability, and cloud operations", searchContext: "DevOps and cloud operations", sampleTopic: "Kubernetes cost visibility for startups" },
  { id: "cybersecurity", title: "Cybersecurity", description: "security operations, identity, application security, and developer security tooling", searchContext: "cybersecurity teams", sampleTopic: "security review workflow for small SaaS teams" },
  { id: "data-analytics", title: "Data and Analytics", description: "BI, data operations, governance, experimentation, and analytics workflows", searchContext: "data and analytics teams", sampleTopic: "self-serve product analytics for B2B SaaS" },
  { id: "internal-tools", title: "Internal Tools", description: "operations consoles, approvals, back-office workflows, and knowledge systems", searchContext: "internal tools and operations teams", sampleTopic: "approval workflows for finance operations" },
  { id: "b2b-saas", title: "B2B SaaS", description: "software bought by business teams with recurring workflows and measurable ROI", searchContext: "B2B SaaS buyers", sampleTopic: "customer onboarding for mid-market SaaS" },
  { id: "ecommerce", title: "E-commerce", description: "merchant operations, conversion, retention, fulfilment, and customer support", searchContext: "e-commerce merchants", sampleTopic: "returns automation for Shopify stores" },
  { id: "fintech", title: "Fintech", description: "financial workflows, financial planning, payments, and compliance-sensitive products", searchContext: "fintech product users", sampleTopic: "cash-flow planning for freelancers" },
  { id: "hr-recruiting", title: "HR and Recruiting", description: "hiring, employee operations, learning, performance, and people systems", searchContext: "HR and recruiting teams", sampleTopic: "structured interview preparation for engineering hiring" },
  { id: "education", title: "Education", description: "learning experiences, study workflows, instructors, and education operations", searchContext: "learners and educators", sampleTopic: "exam preparation for language learners" },
  { id: "health-wellness", title: "Health and Wellness", description: "non-diagnostic consumer wellbeing, fitness, coaching, and care-adjacent workflows", searchContext: "health and wellness product users", sampleTopic: "habit coaching for remote workers" },
  { id: "creator-economy", title: "Creator Economy", description: "content production, audience growth, creator businesses, and media workflows", searchContext: "creators and media teams", sampleTopic: "short-form video planning for independent educators" },
  { id: "marketplaces", title: "Marketplaces", description: "supply-demand platforms, trust, matching, liquidity, and provider operations", searchContext: "marketplace operators and users", sampleTopic: "trust signals for local service marketplaces" },
  { id: "real-estate", title: "Real Estate", description: "property search, property operations, agents, landlords, and tenant workflows", searchContext: "real estate operators and consumers", sampleTopic: "rental application workflow for independent landlords" },
  { id: "local-business", title: "Local Business", description: "service businesses, bookings, repeat customers, and day-to-day operations", searchContext: "local business owners", sampleTopic: "appointment follow-up for independent salons" },
  { id: "climate-sustainability", title: "Climate and Sustainability", description: "sustainability reporting, resource efficiency, climate operations, and environmental products", searchContext: "sustainability teams", sampleTopic: "carbon reporting for small manufacturers" },
  { id: "consumer-productivity", title: "Consumer Productivity", description: "personal organization, planning, notes, habits, and everyday digital tools", searchContext: "consumer productivity app users", sampleTopic: "shared family planning app" },
  { id: "travel-hospitality", title: "Travel and Hospitality", description: "trip planning, property operations, guest experience, and service logistics", searchContext: "travel and hospitality users", sampleTopic: "group trip planning with shared decisions" },
  { id: "mobile-apps", title: "Mobile Apps", description: "mobile-first products, app discovery, retention, subscriptions, and store feedback", searchContext: "mobile app users", sampleTopic: "subscription retention for meditation apps" }
];

export const WORKFLOW_CATALOG_MISSIONS: WorkflowCatalogMission[] = [
  { id: "voice-of-customer", title: "Voice of Customer", description: "Turn recurring public complaints and requests into a traceable customer-problem brief.", researchFocus: "repeated pain, language customers use, severity, and situations where existing tools fail", deliverables: ["ranked pain clusters", "verbatim evidence links", "customer-language summary", "validation interviews to run"], querySuffixes: ["user complaints", "feature requests", "Reddit discussion", "review pain points", "forum frustrations"] },
  { id: "competitor-map", title: "Competitor Map", description: "Map direct and adjacent alternatives so a team can choose where not to compete.", researchFocus: "competitor positioning, target audiences, pricing signals, weak spots, and meaningful differentiation", deliverables: ["competitor landscape", "positioning gaps", "feature and pricing comparison", "avoidance and differentiation advice"], querySuffixes: ["competitors alternatives", "pricing comparison", "reviews alternatives", "vs comparison", "competitive landscape"] },
  { id: "feature-gap", title: "Feature Gap Discovery", description: "Find the smallest high-signal product gap instead of collecting an unranked feature wish list.", researchFocus: "missing capabilities, workaround behaviour, requested outcomes, and evidence of urgency", deliverables: ["ranked feature gaps", "workarounds people use", "MVP scope proposal", "disconfirming evidence"], querySuffixes: ["missing feature requests", "workarounds complaints", "feature request forum", "limitations reviews", "what users want"] },
  { id: "pricing-packaging", title: "Pricing and Packaging", description: "Research value metrics and buying friction before changing a pricing page or paywall.", researchFocus: "pricing models, willingness-to-pay hints, plan structure, free limits, and objection patterns", deliverables: ["pricing model map", "value-metric hypotheses", "plan and limit ideas", "pricing risks to test"], querySuffixes: ["pricing plans", "pricing complaints", "subscription reviews", "free plan limits", "pricing alternatives"] },
  { id: "audience-segmentation", title: "Audience Segmentation", description: "Separate lookalike audiences by job, trigger, and desired outcome.", researchFocus: "distinct user groups, trigger events, jobs-to-be-done, language, and urgency", deliverables: ["segment cards", "trigger-to-outcome map", "priority segment recommendation", "messages to validate"], querySuffixes: ["user personas", "who uses", "jobs to be done", "community discussion", "buyer needs"] },
  { id: "buyer-journey", title: "Buyer Journey", description: "Reveal the moments that create momentum or abandonment between discovery and adoption.", researchFocus: "discovery paths, evaluation criteria, objections, onboarding friction, and trust signals", deliverables: ["journey map", "adoption blockers", "trust requirements", "activation experiments"], querySuffixes: ["buying process", "onboarding friction", "evaluation criteria", "switching from alternatives", "why users abandon"] },
  { id: "launch-positioning", title: "Launch Positioning", description: "Convert researched evidence into a focused launch narrative and proof plan.", researchFocus: "sharp category language, credible promise, proof required, objections, and launch audiences", deliverables: ["positioning statement", "message hierarchy", "proof asset brief", "launch channel hypotheses"], querySuffixes: ["launch announcement", "product positioning", "alternative complaints", "what users care about", "community language"] },
  { id: "content-demand", title: "Content Demand", description: "Find content topics with evidence of a real unanswered question, not merely high-volume keywords.", researchFocus: "repeated questions, misconceptions, practical examples, credible sources, and content gaps", deliverables: ["content opportunity map", "evidence-backed angles", "claim checklist", "distribution communities"], querySuffixes: ["how to", "best practices", "questions Reddit", "documentation gaps", "community discussion"] },
  { id: "integration-partnership", title: "Integration and Partnership", description: "Prioritize integrations and ecosystem partners according to user pull and mutual value.", researchFocus: "stack adjacency, existing integrations, workflow hand-offs, community requests, and partner fit", deliverables: ["integration shortlist", "user-pull evidence", "partnership thesis", "technical and commercial risks"], querySuffixes: ["integrations", "connectors feature request", "ecosystem partners", "workflow integration", "API integration"] },
  { id: "market-entry", title: "Market Entry", description: "Choose a narrow entry wedge using public evidence, constraints, and incumbent weakness.", researchFocus: "entry segments, local or vertical constraints, incumbent alternatives, distribution paths, and regulatory caveats", deliverables: ["entry-wedge options", "incumbent map", "channel hypotheses", "risk and research checklist"], querySuffixes: ["market trends", "alternatives", "industry forum", "buyer pain points", "market report"] },
  { id: "product-validation", title: "Product Validation", description: "Build a falsifiable validation plan around a concrete product hypothesis.", researchFocus: "evidence for and against demand, urgency, reachable users, current alternatives, and test design", deliverables: ["hypothesis scorecard", "supporting and contradictory evidence", "test sequence", "stop or proceed criteria"], querySuffixes: ["problem discussion", "alternatives", "user pain", "product idea validation", "community feedback"] },
  { id: "retention-churn", title: "Retention and Churn", description: "Research why users stay, leave, or downgrade, then turn findings into retention experiments.", researchFocus: "churn language, missing value, switching triggers, habit loops, and win-back opportunities", deliverables: ["churn-risk themes", "retention drivers", "experiment backlog", "metric and cohort questions"], querySuffixes: ["churn complaints", "cancel subscription", "why users leave", "retention feature requests", "switching alternatives"] }
];

function toTitleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildWorkflowCatalog(): WorkflowCatalogEntry[] {
  return WORKFLOW_CATALOG_MISSIONS.flatMap((mission) =>
    WORKFLOW_CATALOG_DOMAINS.map((domain) => {
      const id = `${domain.id}-${mission.id}`;
      return {
        id,
        title: `${domain.title}: ${mission.title}`,
        category: mission.title,
        description: `${mission.description} Focused on ${domain.description}.`,
        domain,
        mission,
        examplePath: `examples/workflows/catalog/${mission.id}/${id}.md`
      };
    })
  );
}

export const WORKFLOW_CATALOG = buildWorkflowCatalog();
export const WORKFLOW_CATALOG_COUNT = WORKFLOW_CATALOG.length;
export const WORKFLOW_CATALOG_TITLE = toTitleCase("research-workflow-catalog");
