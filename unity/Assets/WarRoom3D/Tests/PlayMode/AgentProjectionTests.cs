using NUnit.Framework;

namespace WarRoom3D.Tests
{
    public sealed class AgentProjectionTests
    {
        private static LiveSnapshot Snapshot() => new LiveSnapshot {
            sessions = new[] {
                new LiveSession { sessionKey = "s1", projectId = "p1", provider = "codex", sourceId = "fonte-sintetica", presence = "trabalhando", freshness = "atual", lastSeen = "2026-11-08T18:00:00Z" },
                new LiveSession { sessionKey = "s2", projectId = "p2", provider = "claude", presence = "observada", freshness = "atual" }
            },
            agents = new[] {
                new LiveAgent { agentKey = "principal", sessionKey = "s1", presence = "trabalhando", parentStatus = "principal" },
                new LiveAgent { agentKey = "filho", sessionKey = "s1", parentAgentKey = "principal", presence = "aguardando", parentStatus = "vinculado" },
                new LiveAgent { agentKey = "outro", sessionKey = "s2", presence = "observada", parentStatus = "principal" }
            },
            tasks = new[] {
                new LiveTask { taskId = "t1", sessionKey = "s1", agentKey = "filho", title = "Tarefa sintética", status = "trabalhando", provenance = "observed" },
                new LiveTask { taskId = "t2", sessionKey = "s1", agentKey = "filho", title = "Outra tarefa", status = "aguardando", provenance = "observed" }
            },
            invocations = new[] {
                new LiveInvocation { invocationId = "i1", sessionKey = "s1", agentKey = "filho", kind = "tool", name = "Ferramenta sintética", status = "falha_observada" },
                new LiveInvocation { invocationId = "i2", sessionKey = "s1", agentKey = "filho", kind = "skill", name = "Skill sintética", status = "observada" }
            }
        };

        [Test]
        public void ParentsAndEvidenceRemainInTheirProjectAndAgent()
        {
            var rows = AgentProjection.ForProject(Snapshot(), "p1", true);
            Assert.That(rows.Count, Is.EqualTo(2));
            Assert.That(rows[0].AgentKey, Is.EqualTo("principal"));
            Assert.That(rows[1].AgentKey, Is.EqualTo("filho"));
            Assert.That(rows[1].ParentStatus, Is.EqualTo("vinculado"));
            Assert.That(rows[1].Failure, Is.True);
            Assert.That(rows[1].Detail, Does.Contain("Tarefa sintética"));
            Assert.That(rows[1].Detail, Does.Contain("Outra tarefa"));
            Assert.That(rows[1].Detail, Does.Contain("Skill sintética"));
            Assert.That(rows[1].Detail, Does.Contain("fonte-sintetica"));
            Assert.That(rows[0].Detail, Does.Not.Contain("Tarefa sintética"));
            Assert.That(rows[0].Failure, Is.False);
        }

        [Test]
        public void MissingParentAndSourceLossStayExplicit()
        {
            var state = Snapshot();
            state.agents[1].parentAgentKey = "ausente";
            var rows = AgentProjection.ForProject(state, "p1", false);
            Assert.That(rows[1].Label, Does.Contain("Subagente · vínculo pendente"));
            Assert.That(rows[0].Uncertain, Is.True);
            Assert.That(rows[1].Uncertain, Is.True);
            Assert.That(rows[0].DisplayState, Is.EqualTo("Sem confirmação"));
            state.agents[1].presence = "encerrada";
            rows = AgentProjection.ForProject(state, "p1", false);
            Assert.That(rows[1].Ended, Is.True);
            state.agents[1].presence = "aguardando";
            state.sessions[0].presence = "encerrada";
            rows = AgentProjection.ForProject(state, "p1", false);
            Assert.That(rows[0].Ended, Is.True);
            Assert.That(rows[1].Ended, Is.True);
        }

        [Test]
        public void LocalAliasChangesLabelWithoutChangingObservedIdentityOrEvidence()
        {
            try
            {
                AgentLocalProfile.Save("p1", "s1", "principal", "Joana", 2);
                var rows = AgentProjection.ForProject(Snapshot(), "p1", true);
                Assert.That(rows[0].DisplayName, Is.EqualTo("Joana"));
                Assert.That(rows[0].Style, Is.EqualTo(2));
                Assert.That(rows[0].LabelOrigin, Is.EqualTo("apelido local"));
                Assert.That(rows[0].AgentKey, Is.EqualTo("principal"));
                Assert.That(rows[0].SessionKey, Is.EqualTo("s1"));
                Assert.That(rows[0].Detail, Does.Contain("Tarefas: não observadas"));
                Assert.That(rows[1].Detail, Does.Contain("Tarefa sintética"));
            }
            finally { AgentLocalProfile.Clear("p1", "s1", "principal"); }
        }
    }
}
