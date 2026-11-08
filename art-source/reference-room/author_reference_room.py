"""Autoria deterministica da sala de referencia. Blender 5.2, unidades em metros.

Uso: blender -b --python author_reference_room.py -- <saida.fbx> <fonte.blend>
Geometria, materiais e composicao originais do projeto War-Room3D.
"""
import bpy
import math
import sys
from mathutils import Vector

fbx_path, blend_path = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0.0, roughness=0.5, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        output = mat.node_tree.nodes.get("Material Output") or mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat

dark = material("01_Graphite", (0.047, 0.077, 0.100), 0.55, 0.32)
shell = material("02_Shell", (0.105, 0.151, 0.187), 0.72, 0.28)
edge = material("03_Edge", (0.215, 0.304, 0.345), 0.75, 0.22)
floor = material("04_Floor", (0.105, 0.160, 0.187), 0.35, 0.48)
seat = material("05_Seat", (0.073, 0.111, 0.145), 0.12, 0.7)
glass = material("06_Glass", (0.057, 0.216, 0.260), 0.50, 0.18)
cyan = material("07_Cyan", (0.018, 0.72, 0.80), 0.10, 0.25, 1.6)
mint = material("08_Mint", (0.12, 0.79, 0.51), 0.08, 0.34, 0.8)
warm = material("09_Warm", (1.0, 0.47, 0.17), 0.08, 0.36, 0.75)
leaf = material("10_Leaf", (0.08, 0.42, 0.24), 0.0, 0.55)
screen = material("11_Screen", (0.022, 0.13, 0.17), 0.2, 0.28, 0.15)

root = bpy.data.objects.new("ReferenceRoom", None)
bpy.context.collection.objects.link(root)
# O desenho abaixo usa Y como altura e Z como profundidade (convencao Unity).
# Blender e Z-up; a raiz converte os eixos sem alterar as coordenadas de autoria.
root.rotation_euler.x = math.pi / 2

def group(name):
    item = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(item)
    item.parent = root
    return item

architecture = group("Architecture")
furniture = group("Furniture")
equipment = group("Equipment")
details = group("Details")
cut_rear = group("CUTAWAY_Rear")
cut_front = group("CUTAWAY_Front")
cut_left = group("CUTAWAY_Left")
cut_right = group("CUTAWAY_Right")

def finish(obj, name, mat, parent, bevel=0.0):
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Bordas usinadas", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            obj.modifiers.remove(mod)
        normal = obj.modifiers.new("Normais", "WEIGHTED_NORMAL")
        try:
            bpy.ops.object.modifier_apply(modifier=normal.name)
        except RuntimeError:
            obj.modifiers.remove(normal)
    for poly in obj.data.polygons:
        poly.use_smooth = len(poly.vertices) > 4
    return obj

def box(name, xyz, dims, mat, parent=architecture, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    obj = bpy.context.object
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, min(bevel, min(dims) * 0.35))

def cyl(name, xyz, radius, depth, mat, parent=furniture, vertices=32, scale=(1, 1, 1), bevel=0.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.x = -math.pi / 2
    return finish(obj, name, mat, parent, min(bevel, depth * 0.3))

def tube(name, a, b, radius, mat, parent=details):
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    obj = cyl(name, mid, radius, (b-a).length, mat, parent, 10, bevel=0)
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    return obj

def torus(name, xyz, major, minor, mat, parent=details, scale=(1,1,1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
        location=xyz, major_radius=major, minor_radius=minor)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.x = -math.pi / 2
    return finish(obj, name, mat, parent)

# Piso: placas de 1 m com juntas reais, soleira e rodape em camadas.
box("Base facetada", (0,-0.20,0), (9.8,0.35,7.35), dark, bevel=0.18)
for x in range(-4,5):
    for z in range(-3,4):
        box(f"Placa piso {x} {z}", (x,0.015,z), (0.97,0.07,0.97),
            floor if (x+z)%3 else shell, bevel=0.018)
for x in (-4.62,4.62):
    box("Rodape lateral", (x,0.18,0), (0.18,0.35,7.0), shell)
    box("Luz de rodape", (x,0.11,0), (0.035,0.035,6.85), cyan, bevel=0.008)
box("Rodape posterior", (0,0.18,3.45), (9.25,0.35,0.18), shell)
box("Luz posterior baixa", (0,0.11,3.33), (8.95,0.035,0.035), cyan, bevel=0.008)
for x in (-4.52,4.52):
    for z in (-3.25,0,3.25):
        box("Contraforte externo", (x,1.20,z), (0.52,2.35,0.36), edge, bevel=0.09)
        box("Alma contraforte", (x,1.20,z), (0.30,2.13,0.20), dark)
        box("Filete contraforte", (x,1.25,z-0.15), (0.07,1.65,0.035), cyan, bevel=0.01)
for z in (-3.30,3.30):
    for x in (-4.3,4.3):
        box("Pilar angular", (x,1.25,z), (0.65,2.45,0.55), shell, bevel=0.13)
        box("Friso pilar", (x,0.47,z-0.32), (0.38,0.045,0.035), mint, bevel=0.01)

# Meia parede frontal mantem vista aberta. Painel posterior e laterais recortaveis.
for x in (-3.45,3.45):
    box("Peitoril frontal", (x,0.56,-3.55), (2.65,1.0,0.32), shell, bevel=0.09)
    box("Borda frontal", (x,1.08,-3.55), (2.64,0.09,0.40), edge)
    box("Luz frontal", (x,0.18,-3.75), (2.3,0.035,0.035), cyan, bevel=0.008)
for x in (-3.25,0,3.25):
    box("Parede interna entrada", (x,1.56,-3.48), (3.05,2.25,0.18), dark, cut_front)
    box("Viga interna entrada", (x,2.76,-3.48), (3.02,0.12,0.28), edge, cut_front)
    box("Filete interno entrada", (x,2.55,-3.33), (2.84,0.035,0.035), cyan, cut_front, 0.008)
for x in (-3.1,3.1):
    box("Monitor entrada moldura", (x,1.62,-3.31), (2.36,0.90,0.08), edge, cut_front)
    box("Monitor entrada vidro", (x,1.62,-3.25), (2.17,0.73,0.02), screen, cut_front, 0.005)
    for j in range(7):
        box("Sinal monitor entrada",(x-0.85+j*0.27,1.42+0.05*(j%3),-3.22),
            (0.16,0.07+0.04*(j%3),0.008),mint if j%3 else cyan,cut_front,0.002)
box("Portal entrada",(0,1.38,-3.26),(1.55,2.05,0.09),shell,cut_front)
box("Miolo portal",(0,1.38,-3.20),(1.26,1.77,0.02),dark,cut_front,0.005)
box("Luz portal",(0,2.30,-3.18),(1.33,0.045,0.025),warm,cut_front,0.005)
for x in (-3.25,0,3.25):
    box("Painel posterior", (x,1.48,3.48), (3.15,2.4,0.20), dark, cut_rear, 0.035)
    box("Moldura superior posterior", (x,2.77,3.48), (3.10,0.13,0.26), edge, cut_rear)
    box("Filete posterior", (x,2.54,3.35), (2.92,0.035,0.03), cyan, cut_rear, 0.008)
for side, parent in ((-1,cut_left),(1,cut_right)):
    for z in (-1.95,0.65,2.65):
        box("Painel lateral", (side*4.73,1.48,z), (0.20,2.4,2.48), dark, parent)
        box("Friso lateral", (side*4.58,2.54,z), (0.035,0.035,2.18), cyan, parent, 0.008)
        box("Tampa lateral", (side*4.73,2.77,z), (0.29,0.13,2.40), edge, parent)

# Mesa oval: pedestal, tampo laminado e aro de luz separado.
cyl("Pedestal mesa", (0,0.42,0.15), 1.0,0.72,shell,scale=(1.38,1,1))
cyl("Sombra mesa", (0,0.77,0.15), 2.21,0.12,dark,scale=(1.25,0.82,1))
cyl("Tampo mesa", (0,0.86,0.15), 2.2,0.16,shell,scale=(1.25,0.82,1))
cyl("Inserto mesa", (0,0.95,0.15), 1.81,0.035,dark,scale=(1.22,0.80,1))
torus("Aro luminoso mesa", (0,0.78,0.15),2.20,0.027,cyan,scale=(1.25,0.82,1))
for i in range(8):
    angle = i*math.tau/8
    x,z = math.cos(angle)*2.38, math.sin(angle)*1.63+0.15
    box("Parafuso mesa", (x,0.965,z), (0.05,0.01,0.05),edge,details,0.006)

# Holograma espacial: anel fisico, vertices e arestas tridimensionais.
cyl("Emissor holografico", (0,1.0,0.15),0.55,0.12,glass)
torus("Aro holograma", (0,1.12,0.15),0.55,0.026,cyan)
nodes=[]
for i in range(6):
    a = i*math.tau/6
    nodes.append((math.cos(a)*0.65,1.70+0.14*math.sin(a*2),0.15+math.sin(a)*0.48))
nodes += [(0,2.28,0.15),(0,1.28,0.15)]
for i,p in enumerate(nodes):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=0.065,location=p)
    finish(bpy.context.object,f"No holograma {i}",cyan,details)
for i in range(6):
    tube("Aresta holograma",nodes[i],nodes[(i+1)%6],0.012,cyan)
    tube("Aresta holograma",nodes[i],nodes[6],0.010,cyan)
    if i%2==0: tube("Aresta holograma",nodes[i],nodes[7],0.008,mint)

# Quatro postos com cadeiras de costas curvas e telas inclinadas para a mesa.
for i,angle in enumerate((45,135,225,315)):
    a=math.radians(angle)
    x,z=math.cos(a)*3.15, math.sin(a)*2.15+0.15
    chair=group(f"Chair_{i+1}")
    chair.location=(x,0,z)
    chair.rotation_euler[1]=-a-math.pi/2
    box("Coluna cadeira",(0,0.45,0),(0.11,0.75,0.11),edge,chair)
    cyl("Base cadeira",(0,0.13,0),0.50,0.06,dark,chair,vertices=12)
    box("Assento cadeira",(0,0.90,0),(0.84,0.16,0.72),seat,chair,0.11)
    box("Encosto cadeira",(0,1.33,0.37),(0.90,0.92,0.17),seat,chair,0.085)
    box("Costura encosto",(0,1.35,0.27),(0.62,0.56,0.025),shell,chair,0.04)
    for dx in (-0.48,0.48):
        box("Braco cadeira",(dx,1.04,-0.05),(0.10,0.10,0.63),edge,chair)
    station=group(f"Station_{i+1}")
    station.location=(math.cos(a)*1.92,0,math.sin(a)*1.32+0.15)
    station.rotation_euler[1]=-a-math.pi/2
    box("Base terminal",(0,0.99,0),(0.72,0.045,0.37),dark,station)
    box("Haste terminal",(0,1.12,0.12),(0.075,0.23,0.075),edge,station)
    box("Painel terminal",(0,1.33,0.16),(0.94,0.56,0.07),edge,station,0.035)
    box("Vidro terminal",(0,1.33,0.118),(0.82,0.44,0.015),screen,station,0.009)
    for j in range(4):
        box("Linha terminal",(-0.20,1.45-j*0.07,0.105),(0.32+0.1*(j%2),0.009,0.007),cyan if j==0 else mint,station,0.002)

# Dois paineis de parede com conteudo abstrato tridimensional, sem texto falso.
for k,x in enumerate((-1.75,1.75)):
    box("Moldura painel",(x,1.72,3.22),(3.05,1.15,0.10),edge,equipment,0.07)
    box("Vidro painel",(x,1.72,3.15),(2.82,0.93,0.018),screen,equipment,0.01)
    for j in range(11):
        px=x-1.21+j*0.23
        h=0.18+0.20*math.sin(j*0.72+k)
        box("Grafico painel",(px,1.45+h/2,3.13),(0.10,h,0.008),mint if k==0 else cyan,equipment,0.003)

# Racks individuais com gavetas, trilhos e leds. Posicoes conservam corredores.
for rack_i,z in enumerate((-1.65,-0.35,0.95)):
    x=4.12
    rack=group(f"Rack_{rack_i+1}")
    rack.location=(x,0,z)
    box("Corpo rack",(0,1.20,0),(0.86,2.28,0.95),dark,rack,0.06)
    box("Moldura rack",(-0.05,1.2,-0.49),(0.72,2.11,0.06),edge,rack,0.04)
    for j in range(6):
        y=0.34+j*0.34
        box("Modulo rack",(-0.05,y,-0.53),(0.61,0.27,0.035),shell,rack,0.016)
        for t in range(3):
            box("Led rack",(-0.28+t*0.10,y,-0.557),(0.034,0.016,0.008),cyan if t<2 else mint,rack,0.003)

def plant(name,x,z):
    pot=group(name)
    pot.location=(x,0,z)
    cyl("Vaso",(0,0.32,0),0.27,0.55,shell,pot,vertices=12)
    cyl("Borda vaso",(0,0.61,0),0.30,0.07,edge,pot,vertices=12)
    for j in range(9):
        a=j*math.tau/9
        tube("Talo",(0,0.6,0),(math.cos(a)*0.13,1.0,math.sin(a)*0.13),0.018,leaf,pot)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=1,
            location=(math.cos(a)*0.23,1.10,math.sin(a)*0.23))
        obj=bpy.context.object
        obj.scale=(0.11,0.34,0.055)
        obj.rotation_euler[2]=-math.cos(a)*0.55
        finish(obj,"Folha",mint if j%4==0 else leaf,pot)
plant("Plant_Left",-4.0,2.4)
plant("Plant_Front",-4.0,-2.6)

box("Soleira entrada",(0,0.12,-3.55),(2.25,0.12,0.42),edge,bevel=0.04)
box("Guia entrada",(0,0.20,-3.79),(1.95,0.025,0.025),cyan,bevel=0.005)

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.fbx(filepath=fbx_path, use_selection=False, apply_unit_scale=True,
    object_types={"MESH", "EMPTY"}, mesh_smooth_type="FACE", add_leaf_bones=False,
    path_mode="AUTO", use_mesh_modifiers=True)
print("REFERENCE_ROOM_EXPORT_OK", fbx_path)
