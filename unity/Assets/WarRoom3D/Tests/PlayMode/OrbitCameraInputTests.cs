using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace WarRoom3D.Tests
{
    public sealed class OrbitCameraInputTests : InputTestFixture
    {
        [Test]
        public void RightDragAndWheelControlTheCamera()
        {
            var mouse = InputSystem.AddDevice<Mouse>();
            var host = new GameObject("OrbitCameraInputTest");
            try
            {
                var camera = host.AddComponent<OrbitCamera>();
                camera.ResetView();
                var point = new Vector2(Screen.width - 40f, Screen.height * 0.5f);

                Move(mouse.position, point, Vector2.zero);
                Press(mouse.rightButton);
                camera.SendMessage("Update");
                Move(mouse.position, point + new Vector2(90f, 0f), new Vector2(90f, 0f));
                camera.SendMessage("Update");
                Assert.That(camera.Yaw, Is.EqualTo(61.2f).Within(0.01f));

                Release(mouse.rightButton);
                camera.SendMessage("Update");
                Set(mouse.scroll, new Vector2(0f, 120f));
                camera.SendMessage("Update");
                Assert.That(camera.Distance, Is.EqualTo(51.6f).Within(0.01f));

                camera.ResetView();
                Assert.That(camera.Yaw, Is.EqualTo(45f));
                Assert.That(camera.Distance, Is.EqualTo(54f));
            }
            finally { Object.Destroy(host); }
        }

        [UnityTest]
        public IEnumerator HudBlocksMouseOrbitAndZoom()
        {
            var mouse = InputSystem.AddDevice<Mouse>();
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var camera = Object.FindAnyObjectByType<OrbitCamera>();
            var hud = Object.FindAnyObjectByType<HudPresenter>();
            Assert.That(camera, Is.Not.Null);
            Assert.That(hud, Is.Not.Null);
            var point = new Vector2(40f, Screen.height * 0.5f);
            Assert.That(hud.IsPointerOverHud(point), Is.True, "Painel esquerdo não encontrado na posição de teste");

            camera.ResetView();
            Move(mouse.position, point, Vector2.zero);
            InputSystem.Update();
            Press(mouse.rightButton);
            InputSystem.Update();
            camera.SendMessage("Update");
            Move(mouse.position, point + new Vector2(90f, 0f), new Vector2(90f, 0f));
            InputSystem.Update();
            camera.SendMessage("Update");
            Assert.That(camera.Yaw, Is.EqualTo(45f));

            Set(mouse.scroll, new Vector2(0f, 120f));
            InputSystem.Update();
            camera.SendMessage("Update");
            Assert.That(camera.Distance, Is.EqualTo(54f));
        }
    }
}
