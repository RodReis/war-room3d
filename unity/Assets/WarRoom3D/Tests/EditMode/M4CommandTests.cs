using System;
using NUnit.Framework;
using UnityEngine;

namespace WarRoom3D.Tests
{
    public sealed class M4CommandTests
    {
        [Test]
        public void CapabilityNeedsLiveConnectionCredentialAndUnexpiredProof()
        {
            var now = DateTime.UtcNow;
            var session = new CommandSession { active = true, capabilities = new[] {
                new CommandCapability { action = "send_message", available = true, proof = new CapabilityProof { evidenceRef = "synthetic:proof", validUntil = now.AddMinutes(1).ToString("O") } },
                new CommandCapability { action = "decide_permission", available = false }
            } };
            Assert.That(CommandPolicy.CanOffer(session, "send_message", true, false, true, now), Is.True);
            Assert.That(CommandPolicy.CanOffer(session, "decide_permission", true, false, true, now), Is.False);
            Assert.That(CommandPolicy.CanOffer(session, "send_message", true, true, true, now), Is.False);
            Assert.That(CommandPolicy.CanOffer(session, "send_message", false, false, true, now), Is.False);
            Assert.That(CommandPolicy.CanOffer(session, "send_message", true, false, false, now), Is.False);
            Assert.That(CommandPolicy.CanOffer(session, "send_message", true, false, true, now.AddMinutes(2)), Is.False);
        }

        [Test]
        public void MessageAndDecisionSerializeOnlyTheirTypedPayload()
        {
            var message = new MessageIntent { action = "send_message", payload = new MessagePayload { text = "Texto com \"aspas\" e ação" } };
            var json = CommandPolicy.Serialize(message);
            StringAssert.Contains("\"requestId\":null", json);
            StringAssert.Contains("\"confirmationId\":null", json);
            StringAssert.Contains("\"payload\":{\"text\":", json);
            StringAssert.DoesNotContain("\"decision\"", json);
            var decision = new DecisionIntent { action = "decide_permission", requestId = "r1", payload = new DecisionPayload { decision = "deny" } };
            var permissionJson = CommandPolicy.Serialize(decision);
            StringAssert.Contains("\"payload\":{\"decision\":\"deny\"}", permissionJson);
            StringAssert.DoesNotContain("\"text\"", permissionJson);
            StringAssert.Contains("incerto", CommandPolicy.ResultLabel("unknown"));
        }
    }
}
