"""Cria um rack modular sintético para ensaiar o fluxo Blender MCP -> Unity.

Executar com `node tools/mcp-smoke.mjs blender --code-file tools/blender/m0-rack.py
--output-dir docs/analise/m0-rack`. Os binários são locais e ignorados pelo Git.
"""

import bpy
import json
from pathlib import Path


output_dir = Path(__OUTPUT_DIR__)
output_dir.mkdir(parents=True, exist_ok=True)
if bpy.data.filepath and Path(bpy.data.filepath).parent.resolve() != output_dir.resolve():
    raise RuntimeError("Use uma sessão temporária do Blender; o arquivo aberto está fora do diretório de ensaio")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for item in tuple(bpy.data.materials):
    if item.users == 0 and item.name.split(".")[0] in {"grafite", "painel_azul_escuro", "sinal_ciano"}:
        bpy.data.materials.remove(item)


def material(name, rgb, metallic=0.0, roughness=0.5):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, 1.0)
    result.use_nodes = True
    principled = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (*rgb, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return result


frame = material("grafite", (0.075, 0.095, 0.13), 0.75, 0.35)
panel = material("painel_azul_escuro", (0.025, 0.08, 0.12), 0.25, 0.4)
signal = material("sinal_ciano", (0.025, 0.64, 0.68), 0.1, 0.3)

root = bpy.data.objects.new("RackM0", None)
bpy.context.collection.objects.link(root)
root.location = (0, 0, 0)


def box(name, location, dimensions, assigned_material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(assigned_material)
    obj.parent = root
    return obj


# Metros; pivô no centro da base para encaixe em piso modular.
for x, side in ((-0.57, "esquerda"), (0.57, "direita")):
    box(f"coluna_{side}", (x, 0, 1.1), (0.06, 0.68, 2.2), frame)
for z, level in ((0.04, "base"), (2.16, "topo")):
    box(level, (0, 0, z), (1.2, 0.68, 0.08), frame)
box("fundo", (0, 0.32, 1.1), (1.08, 0.04, 2.1), frame)
for slot in range(4):
    z = 0.37 + slot * 0.46
    box(f"modulo_{slot + 1}", (0, -0.16, z), (1.03, 0.30, 0.35), panel)
    box(f"indicador_{slot + 1}", (0.39, -0.318, z), (0.13, 0.012, 0.025), signal)
for x, side in ((-0.45, "esquerdo"), (0.45, "direito")):
    box(f"pe_{side}", (x, 0, 0.015), (0.15, 0.55, 0.03), frame)

bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children:
    child.select_set(True)
bpy.context.view_layer.objects.active = root

blend_path = output_dir / "rack-m0.blend"
glb_path = output_dir / "rack-m0.glb"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=True)

meshes = [obj for obj in root.children if obj.type == "MESH"]
print(json.dumps({
    "blend": str(blend_path),
    "glb": str(glb_path),
    "objects": len(meshes),
    "triangles": sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons),
    "materials": [item.name for item in (frame, panel, signal)],
    "bounds_m": [1.2, 0.68, 2.2],
    "pivot": "centro da base",
}))
