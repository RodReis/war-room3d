"""Avatares humanos originais da sala de referência (Blender 5.2, metros).

Uso: blender -b --python author_agents.py -- <pasta-unity/Art/Agents> <fonte.blend>
Rig de partes rígidas: malha e armature editáveis, sem ativos de terceiros.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

output_dir, blend_path = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(output_dir, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0.0, roughness=0.45, glow=0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    bsdf = item.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = item.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        output = item.node_tree.nodes.get("Material Output") or item.node_tree.nodes.new("ShaderNodeOutputMaterial")
        item.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if glow:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = glow
    return item


cloth = material("Agent_Cloth", (0.055, 0.105, 0.145), 0.18, 0.72)
panel = material("Agent_Panel", (0.16, 0.27, 0.32), 0.34, 0.4)
trim = material("Agent_Trim", (0.16, 0.70, 0.76), 0.18, 0.3, 0.35)
skin = material("Agent_Skin", (0.62, 0.39, 0.28), 0.0, 0.56)
hair = material("Agent_Hair", (0.025, 0.042, 0.064), 0.06, 0.65)
glove = material("Agent_Glove", (0.075, 0.13, 0.17), 0.05, 0.6)
sole = material("Agent_Sole", (0.03, 0.055, 0.075), 0.05, 0.78)
badge = material("Agent_Badge", (0.13, 0.86, 0.78), 0.1, 0.24, 0.7)


def finish(obj, name, mat, member):
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    member.append(obj)
    return obj


def ellipsoid(name, center, size, mat, member, segments=18, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, member)


def box(name, center, size, mat, member, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Cantos suaves", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.affect = 'EDGES'
        normal = obj.modifiers.new("Normais", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
    return finish(obj, name, mat, member)


def limb(name, start, end, radius_start, radius_end, mat, member, sides=14):
    direction = Vector(end) - Vector(start)
    middle = (Vector(start) + Vector(end)) / 2
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius_end, radius2=radius_start,
                                    depth=direction.length, location=middle)
    obj = bpy.context.object
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    bevel = obj.modifiers.new("Arredondamento", "BEVEL")
    bevel.width = min(radius_start, radius_end) * 0.22
    bevel.segments = 2
    return finish(obj, name, mat, member)


def rig(name, seated):
    bpy.ops.object.armature_add(enter_editmode=False, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = name + "Rig"
    arm.data.name = name + "Bones"
    arm.show_in_front = True
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    arm.data.edit_bones.remove(arm.data.edit_bones[0])
    hip = 0.12 if seated else 0.92
    shoulder = hip + 0.55
    neck = shoulder + 0.12
    parts = {
        "Hips": ((0, 0, hip - 0.12), (0, 0, hip + 0.10), None),
        "Spine": ((0, 0, hip + 0.08), (0, 0, neck), "Hips"),
        "Head": ((0, 0, neck), (0, -0.01, neck + 0.34), "Spine"),
    }
    for side, sign in (("L", -1), ("R", 1)):
        shoulder_p = (sign * 0.31, -0.02, shoulder)
        elbow = (sign * 0.42, -0.32 if seated else -0.04, hip + (0.30 if seated else 0.12))
        wrist = (sign * 0.29 if seated else sign * 0.43,
                 -0.62 if seated else -0.08, hip + (0.22 if seated else -0.13))
        hip_p = (sign * 0.18, 0, hip)
        knee = (sign * 0.21, -0.57 if seated else -0.02, hip - (0.10 if seated else 0.48))
        ankle = (sign * 0.22, -0.60 if seated else -0.03, hip - (0.82 if seated else 0.87))
        parts["UpperArm_" + side] = (shoulder_p, elbow, "Spine")
        parts["Forearm_" + side] = (elbow, wrist, "UpperArm_" + side)
        parts["Thigh_" + side] = (hip_p, knee, "Hips")
        parts["Shin_" + side] = (knee, ankle, "Thigh_" + side)
    for bone_name, (start, end, _) in parts.items():
        bone = arm.data.edit_bones.new(bone_name)
        bone.head, bone.tail = start, end
    for bone_name, (_, _, parent) in parts.items():
        if parent:
            arm.data.edit_bones[bone_name].parent = arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    meshes = []
    owned = {}
    def own(bone_name, obj):
        owned[obj] = bone_name
        return obj

    own("Hips", ellipsoid("Quadril", (0, 0, hip), (0.28, 0.17, 0.16), cloth, meshes))
    own("Spine", box("Jaqueta facetada", (0, 0.02, hip + 0.36), (0.58, 0.29, 0.58), cloth, meshes, 0.085))
    own("Spine", box("Placa toracica", (0, -0.145, hip + 0.40), (0.41, 0.035, 0.27), panel, meshes, 0.018))
    own("Spine", box("Faixa luminosa", (0, -0.17, hip + 0.51), (0.25, 0.025, 0.018), trim, meshes, 0.005))
    own("Spine", box("Cinto", (0, -0.005, hip + 0.09), (0.59, 0.31, 0.10), panel, meshes, 0.022))
    own("Spine", box("Distintivo provedor", (-0.20, -0.18, hip + 0.48), (0.075, 0.018, 0.09), badge, meshes, 0.009))
    own("Spine", ellipsoid("Gola", (0, 0.01, neck - 0.01), (0.19, 0.17, 0.095), panel, meshes))
    own("Head", ellipsoid("Cabeca", (0, -0.025, neck + 0.19), (0.20, 0.17, 0.23), skin, meshes, 22, 14))
    own("Head", ellipsoid("Cabelo superior", (0, 0.025, neck + 0.34), (0.215, 0.17, 0.11), hair, meshes))
    own("Head", box("Franja lateral", (-0.08, -0.16, neck + 0.32), (0.13, 0.05, 0.05), hair, meshes, 0.018))
    own("Head", ellipsoid("Nariz", (0, -0.193, neck + 0.17), (0.028, 0.027, 0.041), skin, meshes, 10, 6))
    for side, sign in (("L", -1), ("R", 1)):
        own("Head", ellipsoid("Orelha " + side, (sign * 0.20, 0, neck + 0.18), (0.035, 0.04, 0.07), skin, meshes, 10, 7))
        own("Head", ellipsoid("Olho " + side, (sign * 0.075, -0.185, neck + 0.23), (0.027, 0.014, 0.018), sole, meshes, 10, 6))
        own("Head", box("Sobrancelha " + side, (sign * 0.075, -0.191, neck + 0.27), (0.075, 0.012, 0.018), hair, meshes, 0.005))
        own("Head", ellipsoid("Auricular " + side, (sign * 0.22, 0, neck + 0.18), (0.025, 0.045, 0.06), panel, meshes, 10, 6))
        shoulder_p, elbow, _ = parts["UpperArm_" + side]
        _, wrist, _ = parts["Forearm_" + side]
        own("UpperArm_" + side, ellipsoid("Ombreira " + side, shoulder_p, (0.17, 0.17, 0.15), panel, meshes))
        own("UpperArm_" + side, limb("Braco " + side, shoulder_p, elbow, 0.13, 0.11, cloth, meshes))
        own("Forearm_" + side, limb("Antebraco " + side, elbow, wrist, 0.11, 0.075, cloth, meshes))
        own("Forearm_" + side, ellipsoid("Punho " + side, wrist, (0.08, 0.075, 0.08), glove, meshes))
        hip_p, knee, _ = parts["Thigh_" + side]
        _, ankle, _ = parts["Shin_" + side]
        own("Thigh_" + side, limb("Coxa " + side, hip_p, knee, 0.17, 0.13, cloth, meshes))
        own("Shin_" + side, ellipsoid("Joelho " + side, knee, (0.14, 0.14, 0.13), panel, meshes))
        own("Shin_" + side, limb("Canela " + side, knee, ankle, 0.13, 0.085, cloth, meshes))
        own("Shin_" + side, ellipsoid("Bota " + side, (ankle[0], ankle[1] - 0.09, ankle[2] - 0.02),
                                      (0.12, 0.23, 0.08), sole, meshes))
    bpy.context.view_layer.update()
    for obj, bone_name in owned.items():
        matrix = obj.matrix_world.copy()
        obj.parent = arm
        obj.parent_type = "BONE"
        obj.parent_bone = bone_name
        obj.matrix_world = matrix
    return [arm] + meshes


models = {"AgentSeated": rig("AgentSeated", True), "AgentStanding": rig("AgentStanding", False)}
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
for name, members in models.items():
    bpy.ops.object.select_all(action="DESELECT")
    for item in members:
        item.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    bpy.ops.export_scene.fbx(filepath=os.path.join(output_dir, name + ".fbx"), use_selection=True,
        apply_unit_scale=True, object_types={"MESH", "ARMATURE"}, mesh_smooth_type="FACE",
        add_leaf_bones=False, axis_forward="-Z", axis_up="Y", path_mode="AUTO", use_mesh_modifiers=True)
print("AGENT_EXPORT_OK", output_dir)
