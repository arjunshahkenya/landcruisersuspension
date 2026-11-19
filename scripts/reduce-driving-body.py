"""Blender stage for bake-driving-body.mjs. Operates on each distinct panel."""
import base64
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def face_budget(part, count):
    name = part["name"].lower()
    # The slightly bowed acrylic surrounds span multiple underlying panes;
    # collapsing them too far produces triangular interruptions in the glazing.
    if "smoke acrylic door visor" in name:
        return count
    if "compound-curved glazing" in name or "painted pillars" in name:
        return min(count, 210)
    if "weatherstrip" in name or "compressed rubber seal" in name or name == "bonnet closing gap":
        return min(count, 135)
    if "wheel housing" in name or "wheel-arch housing" in name:
        return min(count, 34)
    return min(count, min(180, 5 + math.ceil(count * .075)))


def material_for(part):
    color, texture = part["color"], part["tex"]
    if texture in ("ends-steel-grain.webp", "underseal-grain.webp"):
        color, texture = [52,58,57], ""
    if "glass" in part["name"].lower() and part["glass"] and not texture:
        color = [91,121,127]
    return [color, round(part["m"], 2), round(part["r"], 2), texture,
            round(part["alpha"], 2), bool(part["glass"])]


def interpolated_normal(triangle, source_positions, source_normals, point, fallback):
    a, b, c = (source_positions[i] for i in triangle)
    ab, ac, ap = b-a, c-a, point-a
    aa, cc, abac = ab.dot(ab), ac.dot(ac), ab.dot(ac)
    det = aa * cc - abac * abac
    if abs(det) < 1e-20:
        return fallback
    u = (cc * ab.dot(ap) - abac * ac.dot(ap)) / det
    v = (aa * ac.dot(ap) - abac * ab.dot(ap)) / det
    # The nearest point can be on a panel edge after a silhouette collapse.
    u = max(0, min(1, u))
    v = max(0, min(1-u, v))
    n = sum((source_normals[i]*factor for i, factor in zip(triangle, (1-u-v, u, v))), Vector())
    return n.normalized() if n.length_squared > 0.00001 else fallback


def surface_grid(part):
    """Sample original patch nodes to preserve exterior boundaries and shading."""
    name, texture = part["name"].lower(), part["tex"]
    if texture == "surface-cladding.webp" and "protector" in name:
        return (49, 7)
    if texture == "surface-paint.webp" and "shaped side body" in name:
        return (62, 11)
    if texture == "surface-bonnet.webp":
        return (32, 19)
    if "roof pressing" in name:
        return (24, 12)
    if "one-piece rear bumper" in name:
        return (30, 8)
    if "windscreen glazing" in name or "rear screen glazing" in name:
        return (22, 10)
    if texture in ("ends-headlight.webp", "ends-taillight.webp"):
        return (21, 9)
    if "front door leading and sill" in name or "rear door shaped corner" in name:
        return (42, 2)
    if "painted fender return" in name or "fender apron" in name:
        return (22, 8)
    return None


def sample_axis(positions, target):
    """Greedily retain sections farthest from the interpolated surface."""
    end = len(positions)-1
    if end <= target:
        return list(range(end+1))
    chosen = [0, end]
    def deviation(a, b):
        if b-a <= 1:
            return (-1, a)
        t = np.arange(1, b-a)[:, None, None] / (b-a)
        delta = positions[a+1:b] - (positions[a] + t*(positions[b]-positions[a]))
        # Give straight segments some samples, too, for curved source normals.
        scores = np.max(np.linalg.norm(delta, axis=2), axis=1) + (t[:,0,0]*(1-t[:,0,0]))*(b-a)*.0001
        i = int(np.argmax(scores))
        return (scores[i], a+1+i)
    spans = {(0,end): deviation(0,end)}
    while len(chosen) < target+1:
        a,b = max(spans, key=lambda span:spans[span][0])
        _,i = spans.pop((a,b))
        chosen.append(i)
        spans[(a,i)] = deviation(a,i)
        spans[(i,b)] = deviation(i,b)
    return sorted(chosen)


def sample_surface(part, bucket, keep_uv, target):
    verts = np.reshape(part["verts"], (-1,3))
    inds = part["index"][:6]
    stride = max(inds)-1
    if stride < 2 or len(verts)%stride or set(inds) != {0,1,stride,stride+1}:
        return False
    surface = verts.reshape(-1, stride, 3)
    rows = sample_axis(surface, target[1])
    cols = sample_axis(surface.transpose((1,0,2)), target[0])
    using = [row*stride+col for row in rows for col in cols]
    normals = np.reshape(part["norm"], (-1,3))[using]
    uv = np.reshape(part["uvs"], (-1,2))[using] if keep_uv else np.zeros((len(using),2))
    keys = np.concatenate((np.rint(verts[using]*4096), np.rint(normals*127), np.rint(np.clip(uv,-4,4)*4096)), axis=1).astype(int)
    slots = []
    for key in map(tuple,keys):
        if key not in bucket["vertices"]:
            bucket["vertices"][key] = len(bucket["vertices"])
        slots.append(bucket["vertices"][key])
    width = len(cols)
    order = [{0:0,1:1,stride:width,stride+1:width+1}[i] for i in inds]
    for y in range(len(rows)-1):
        for x in range(len(cols)-1):
            offset = y*width+x
            for j in (0,3):
                tri = [i+offset for i in order[j:j+3]]
                # Some pressed surfaces terminate against the wheel arches.
                if len({tuple(keys[i,:3]) for i in tri})==3:
                    bucket["indices"].extend(slots[i] for i in tri)
    return True


def reduce_part(part, bucket, keep_uv):
    target = surface_grid(part)
    if target and sample_surface(part, bucket, keep_uv, target):
        return
    positions = [Vector(row) for row in np.reshape(part["verts"], (-1,3))]
    normals = [Vector(row) for row in np.reshape(part["norm"], (-1,3))]
    triangles = np.reshape(part["index"], (-1,3))
    corners = np.asarray(part["verts"]).reshape((-1,3))[triangles]
    nondegenerate = np.linalg.norm(np.cross(corners[:,1]-corners[:,0], corners[:,2]-corners[:,0]), axis=1) > 1e-10
    triangles = triangles[nondegenerate]
    if not len(triangles):
        return
    source_uv = np.reshape(part["uvs"], (-1,2))
    mesh = bpy.data.meshes.new("original")
    mesh.from_pydata(positions, [], triangles.tolist())
    mesh.update()
    if keep_uv:
        layer = mesh.uv_layers.new(name="Photo")
        layer.data.foreach_set("uv", source_uv[triangles].ravel().astype(np.float32))
    obj = bpy.data.objects.new("panel", mesh)
    bpy.context.collection.objects.link(obj)
    budget = face_budget(part, len(triangles))
    simplified = budget < len(triangles)
    if simplified:
        modifier = obj.modifiers.new("Preserve silhouette", "DECIMATE")
        modifier.ratio = max(.002, budget / len(triangles))
        modifier.use_collapse_triangulate = True
        surface = BVHTree.FromPolygons(positions, triangles.tolist(), all_triangles=True)
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    reduced = evaluated.to_mesh()
    reduced.calc_loop_triangles()
    uv = reduced.uv_layers.active.data if keep_uv else None
    for face in reduced.loop_triangles:
        if face.area < 2e-11:
            continue
        a, b, c = [reduced.vertices[i].co for i in face.vertices]
        center = (a + b + c) / 3
        for loop, i in zip(face.loops, face.vertices):
            point = reduced.vertices[i].co
            if simplified:
                # Look up the original continuous normal. A tiny inward offset
                # disambiguates hard corners shared by two distinct flat faces.
                inward = center-point
                probe = point + inward * min(.05, .0001 / max(1e-8, inward.length))
                closest, _, tri, _ = surface.find_nearest(probe)
                n = interpolated_normal(triangles[tri], positions, normals, closest, face.normal) if tri is not None else face.normal
            else:
                n = normals[i]
            coords = (round(x*4096) for x in point)
            direction = (round(x*127) for x in n)
            uvq = (round(max(-4, min(4, x))*4096) for x in uv[loop].uv) if keep_uv else (0, 0)
            key = (*coords, *direction, *uvq)
            if key not in bucket["vertices"]:
                bucket["vertices"][key] = len(bucket["vertices"])
            bucket["indices"].append(bucket["vertices"][key])
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def main(draft_path, output_path):
    materials, batches = [], []
    for part in json.loads(Path(draft_path).read_text()):
        finish = material_for(part)
        if finish not in materials:
            materials.append(finish)
            batches.append({"vertices": {}, "indices": []})
        reduce_part(part, batches[materials.index(finish)], bool(finish[3]))
    packed = bytearray()
    pieces = []
    for index, batch in enumerate(batches):
        if not batch["indices"]:
            continue
        pieces.append([index, len(packed), len(batch["vertices"]), len(batch["indices"])])
        for vertex in batch["vertices"]:
            packed.extend(struct.pack("<hhhbbbxhh", *vertex))
        for value in batch["indices"]:
            packed.extend(struct.pack("<H", value))
    compact = lambda value: json.dumps(value, separators=(",",":"))
    lines = ["// Generated by scripts/bake-driving-body.mjs. Position units are 1/4096 metre.",
             "export const finishes="+compact(materials)+";",
             "export const pieces="+compact(pieces)+";",
             "export const packed='"+base64.b64encode(packed).decode("ascii")+"';",
             "export function drivingTexture(file){return new URL('./assets/'+file,import.meta.url).href;}"]
    target = Path(output_path)
    intermediate = target.with_suffix(".partial")
    intermediate.write_text("\n".join(lines)+"\n")
    intermediate.replace(target)
    print("Driving exterior:", sum(row[3]//3 for row in pieces), "triangles,", len(packed), "packed bytes")


if __name__ == "__main__":
    main(*sys.argv[sys.argv.index("--")+1:])
