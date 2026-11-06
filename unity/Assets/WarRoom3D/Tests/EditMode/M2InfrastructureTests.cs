using System;
using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace WarRoom3D.Tests
{
    public sealed class M2InfrastructureTests
    {
        [Test]
        public void CoreContainsFourLogicalRacks()
        {
            var host = new GameObject("Sector");
            try
            {
                var sector = host.AddComponent<SectorBuilder>();
                sector.Build();
                var center = host.transform.Find("Nucleo");
                Assert.That(center, Is.Not.Null);
                var builder = center.GetComponent<DataCenterBuilder>();
                Assert.That(builder, Is.Not.Null);
                builder.Build();
                Assert.That(builder.RackCount, Is.EqualTo(4));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }

        [Test]
        public void DemoRejectsHealthyWithoutCurrentCoverage()
        {
            string json = File.ReadAllText(Path.Combine(Application.dataPath, "WarRoom3D/Demo/m2-infrastructure.v1.json"));
            var fixture = new TextAsset(json);
            try
            {
                Assert.That(InfrastructureDemoLoader.Parse(fixture).resources.Length, Is.EqualTo(5));
                var invalid = new TextAsset(json.Replace("\"health\": \"sem_dados\", \"freshness\": \"expirada\", \"coverage\": \"perdida\"",
                    "\"health\": \"saudavel\", \"freshness\": \"expirada\", \"coverage\": \"perdida\""));
                Assert.Throws<ArgumentException>(() => InfrastructureDemoLoader.Parse(invalid));
                UnityEngine.Object.DestroyImmediate(invalid);
            }
            finally { UnityEngine.Object.DestroyImmediate(fixture); }
        }

        [Test]
        public void DemoRejectsIncidentOnUnlinkedProject()
        {
            string json = File.ReadAllText(Path.Combine(Application.dataPath, "WarRoom3D/Demo/m2-infrastructure.v1.json"));
            var invalid = new TextAsset(json.Replace("\"projectIds\": [\"api-core\", \"design-system\"]",
                "\"projectIds\": [\"api-core\", \"app-mobile\"]"));
            try { Assert.Throws<ArgumentException>(() => InfrastructureDemoLoader.Parse(invalid)); }
            finally { UnityEngine.Object.DestroyImmediate(invalid); }
        }
    }
}
