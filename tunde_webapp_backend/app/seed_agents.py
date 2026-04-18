from __future__ import annotations

from tunde_webapp_backend.app.db import db_session
from tunde_webapp_backend.app.repositories.agent_repository import AgentRepository, RegisterAgentInput


DEFAULT_DOMAINS: list[RegisterAgentInput] = [
    RegisterAgentInput(domain="Physics", capabilities=["reasoning", "units", "derivations"]),
    RegisterAgentInput(domain="Chemistry", capabilities=["reactions", "stoichiometry", "safety"]),
    RegisterAgentInput(domain="Space", capabilities=["astronomy", "missions", "research"]),
    RegisterAgentInput(domain="Geology", capabilities=["earth_science", "risk_assessment", "research"]),
    RegisterAgentInput(domain="AI", capabilities=["ml", "agents", "systems_design"]),
]


def seed_default_agents() -> int:
    """
    Insert the first 5 agent domains if they do not exist.
    Returns number of newly created agents.
    """
    created = 0
    with db_session() as session:
        repo = AgentRepository(session)
        for inp in DEFAULT_DOMAINS:
            before = repo.get_agent_by_domain(inp.domain)
            if before is None:
                repo.register_agent(inp)
                created += 1
    return created


if __name__ == "__main__":
    from tunde_webapp_backend.app.db import init_db

    init_db()
    n = seed_default_agents()
    print(f"Seeded agents: {n}")

