"""Previa de autoria, nao prova do Unity Player.

blender -b ReferenceRoom.blend --python render_preview.py -- <diretorio>
"""
import bpy
import math
import os
import sys
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.14, 0.18, 0.22)

def area(name, location, power, color, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0,0,0)) - obj.location).to_track_quat("-Z", "Y").to_euler()

area("Preview key", (2,-6,10), 1300, (0.65,0.90,1), 8)
area("Preview fill", (-7,1,7), 900, (0.36,1,0.8), 7)
area("Preview rim", (5,6,7), 1100, (0.4,0.75,1), 6)
cam_data = bpy.data.cameras.new("Preview camera")
cam = bpy.data.objects.new("Preview camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = "ORTHO"

def capture(name, position, scale, hidden=()):
    for group_name in ("CUTAWAY_Rear", "CUTAWAY_Front", "CUTAWAY_Left", "CUTAWAY_Right"):
        cut = bpy.data.objects.get(group_name)
        if cut:
            for child in cut.children: child.hide_render = group_name in hidden
    cam.location = position
    cam.rotation_euler = (Vector((0,0,1.15)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.ortho_scale = scale
    scene.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)

capture("interior", (8,11,9), 11, ("CUTAWAY_Right", "CUTAWAY_Front"))
capture("oposto", (-8,-11,9), 11, ("CUTAWAY_Left", "CUTAWAY_Rear"))
capture("quartel", (13,16,18), 15, ("CUTAWAY_Front",))
meshes = [obj.data for obj in scene.objects if obj.type == "MESH"]
for mesh in meshes: mesh.calc_loop_triangles()
print("REFERENCE_ROOM_GEOMETRY", len(meshes), sum(len(mesh.loop_triangles) for mesh in meshes),
      sum(len(mesh.vertices) for mesh in meshes))
