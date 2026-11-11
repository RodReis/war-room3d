using System;
using NUnit.Framework;

namespace WarRoom3D.Tests
{
    public sealed class AgentLocalProfileTests
    {
        [Test]
        public void AliasAndOutfitPersistForOnlyTheSelectedProjectSessionAndAgent()
        {
            var suffix = Guid.NewGuid().ToString("N");
            var project = "synthetic-project-" + suffix;
            var session = "synthetic-session-" + suffix;
            var agent = "synthetic-agent-" + suffix;
            try
            {
                var initial = AgentLocalProfile.Load(project, session, agent);
                AgentLocalProfile.Save(project, session, agent, "  Joana\nTeste  ", 2);
                var restored = AgentLocalProfile.Load(project, session, agent);
                Assert.That(restored.alias, Is.EqualTo("JoanaTeste"));
                Assert.That(restored.style, Is.EqualTo(2));
                Assert.That(AgentLocalProfile.Load(project + "-other", session, agent).alias, Is.Empty);
                Assert.That(AgentLocalProfile.Load(project, session + "-other", agent).alias, Is.Empty);
                Assert.That(AgentLocalProfile.Load(project, session, agent + "-other").alias, Is.Empty);
                AgentLocalProfile.Clear(project, session, agent);
                Assert.That(AgentLocalProfile.Load(project, session, agent).style, Is.EqualTo(initial.style));
            }
            finally { AgentLocalProfile.Clear(project, session, agent); }
        }
    }
}
