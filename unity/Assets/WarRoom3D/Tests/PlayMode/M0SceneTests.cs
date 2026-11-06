using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M0SceneTests
    {
        [UnityTest]
        public IEnumerator SceneBootsWithPermanentDemoSealAndSixRooms()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var loader = Object.FindAnyObjectByType<DemoLoader>();
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            var document = Object.FindAnyObjectByType<UIDocument>();
            Assert.That(loader, Is.Not.Null);
            Assert.That(loader.Snapshot, Is.Not.Null);
            Assert.That(sector.Rooms.Count, Is.EqualTo(6));
            Assert.That(document.rootVisualElement.Q<Label>("demo-seal").text, Is.EqualTo("CONCEITO · DADOS ILUSTRATIVOS"));
            Assert.That(document.rootVisualElement.Q<Button>("enter-button"), Is.Not.Null);
        }
    }
}
