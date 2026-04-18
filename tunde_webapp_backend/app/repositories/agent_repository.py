from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from tunde_webapp_backend.app.models.agent import Agent


@dataclass(frozen=True, slots=True)
class RegisterAgentInput:
    domain: str
    version: str = "0.0.1"
    is_active: bool = True
    capabilities: list[str] | None = None


class AgentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_agent_by_domain(self, domain: str) -> Agent | None:
        d = (domain or "").strip()
        if not d:
            return None
        return self._session.execute(select(Agent).where(Agent.domain == d)).scalar_one_or_none()

    def list_active_agents(self) -> list[Agent]:
        rows = self._session.execute(select(Agent).where(Agent.is_active.is_(True)).order_by(Agent.domain.asc()))
        return list(rows.scalars().all())

    def register_agent(self, agent_data: RegisterAgentInput) -> Agent:
        domain = (agent_data.domain or "").strip()
        if not domain:
            raise ValueError("domain is required")

        existing = self.get_agent_by_domain(domain)
        if existing is not None:
            return existing

        caps = agent_data.capabilities or []
        row = Agent(
            domain=domain,
            version=(agent_data.version or "0.0.1").strip() or "0.0.1",
            is_active=bool(agent_data.is_active),
            capabilities=json.dumps([str(c).strip() for c in caps if str(c).strip()], ensure_ascii=False),
        )
        self._session.add(row)
        self._session.flush()
        return row

