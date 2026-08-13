# Building Materials Shop — Category Structure (L1 / L2 / L3)

A category tree for a Cameroonian building-materials shop (_quincaillerie / matériaux de
construction_), designed to fit how BizTrack CM models categories.

## Design rules (from the BizTrack category model)

- **Depth is capped at 3** (`depth BETWEEN 1 AND 3`), self-referential via `parentId`
  (`null` parent = L1).
- **Products attach only to _terminal_ (leaf) categories** — a category can hold children
  **or** products, never both. Products live at the deepest node of each branch (marked
  `◄ products` below).
- **Size / grade / colour / brand are _not_ categories** — they belong on the SKU as brand
  links + variant attributes. The tree stops at the level a customer actually _browses_.

## Category tree

```
1. Cement & Binders  (Ciment & Liants)
   ├─ Cement
   │   ├─ Grey Cement            ◄ products
   │   └─ White Cement           ◄ products
   ├─ Lime & Plaster
   │   ├─ Hydrated Lime          ◄ products
   │   └─ Gypsum Plaster         ◄ products
   └─ Ready-Mix Mortar & Grout   ◄ products (terminal L2)

2. Aggregates & Sand  (Granulats & Sable)
   ├─ Sand
   │   ├─ River Sand             ◄ products
   │   ├─ Pit Sand               ◄ products
   │   └─ Plastering Sand        ◄ products
   └─ Gravel & Stone
       ├─ Crushed Stone (Ballast)◄ products
       ├─ Gravel                 ◄ products
       └─ Laterite / Fill        ◄ products

3. Blocks & Bricks  (Parpaings & Briques)
   ├─ Hollow Blocks              ◄ products
   ├─ Solid Blocks               ◄ products
   ├─ Clay & Interlocking Bricks ◄ products
   └─ Paving Blocks & Kerbs      ◄ products

4. Steel & Reinforcement  (Fer & Armatures)
   ├─ Rebar (Fer à béton)
   │   ├─ High-Tensile Rebar     ◄ products
   │   └─ Mild Steel Rebar       ◄ products
   ├─ Wire & Mesh
   │   ├─ Binding Wire           ◄ products
   │   └─ Welded Mesh (Treillis) ◄ products
   └─ Structural Steel
       ├─ Angle & Flat Bars      ◄ products
       ├─ Tubes & Hollow Sections◄ products
       └─ Sheets & Plates        ◄ products

5. Roofing  (Toiture)
   ├─ Roofing Sheets
   │   ├─ Aluzinc / Galvanized (Tôles) ◄ products
   │   ├─ Aluminium Sheets       ◄ products
   │   └─ Roofing Tiles          ◄ products
   ├─ Roofing Accessories
   │   ├─ Ridge Caps & Flashing  ◄ products
   │   ├─ Roofing Nails & Screws ◄ products
   │   └─ Gutters & Downpipes    ◄ products
   └─ Insulation & Underlay      ◄ products (terminal L2)

6. Wood & Timber  (Bois & Charpente)
   ├─ Timber & Planks (Chevrons/Planches) ◄ products
   ├─ Plywood & Boards (Contreplaqué)      ◄ products
   ├─ MDF & Particle Board       ◄ products
   └─ Formwork (Coffrage)        ◄ products

7. Doors, Windows & Joinery  (Menuiserie)
   ├─ Doors
   │   ├─ Wooden Doors           ◄ products
   │   ├─ Metal / Steel Doors    ◄ products
   │   └─ Aluminium Doors        ◄ products
   ├─ Windows
   │   ├─ Aluminium Windows      ◄ products
   │   ├─ Louvre / Nako Windows  ◄ products
   │   └─ Burglar-proof & Grilles◄ products
   └─ Frames & Fittings          ◄ products (terminal L2)

8. Tiles & Flooring  (Carrelage & Revêtements)
   ├─ Floor Tiles                ◄ products
   ├─ Wall Tiles                 ◄ products
   ├─ Marble & Granite           ◄ products
   └─ Vinyl & Laminate           ◄ products

9. Plumbing  (Plomberie)
   ├─ Pipes & Fittings
   │   ├─ PVC Pipes & Fittings   ◄ products
   │   ├─ PPR Pipes & Fittings   ◄ products
   │   └─ Galvanized Pipes       ◄ products
   ├─ Water Storage
   │   ├─ Tanks (Polytank)       ◄ products
   │   └─ Pumps                  ◄ products
   ├─ Valves & Taps              ◄ products
   └─ Drainage & Waste           ◄ products

10. Sanitaryware  (Sanitaire)
    ├─ Toilets (WC)              ◄ products
    ├─ Basins & Sinks            ◄ products
    ├─ Showers & Bathtubs        ◄ products
    └─ Bathroom Accessories      ◄ products

11. Electrical  (Électricité)
    ├─ Cables & Wiring           ◄ products
    ├─ Switches & Sockets        ◄ products
    ├─ Lighting
    │   ├─ Bulbs & LED           ◄ products
    │   └─ Fittings & Fixtures   ◄ products
    ├─ Protection & Distribution
    │   ├─ Breakers & Fuses      ◄ products
    │   └─ Distribution Boards   ◄ products
    └─ Conduits & Trunking       ◄ products

12. Paints & Finishes  (Peintures)
    ├─ Paints
    │   ├─ Emulsion (Water-based)◄ products
    │   ├─ Gloss (Oil-based)     ◄ products
    │   └─ Primers & Undercoats  ◄ products
    ├─ Coatings & Treatments
    │   ├─ Waterproofing         ◄ products
    │   ├─ Wood Varnish & Stains ◄ products
    │   └─ Anti-rust             ◄ products
    └─ Painting Tools
        ├─ Brushes & Rollers     ◄ products
        └─ Thinners & Solvents   ◄ products

13. Adhesives, Sealants & Chemicals  (Colles & Mastics)
    ├─ Tile Adhesive & Grout     ◄ products
    ├─ Sealants & Silicone       ◄ products
    ├─ Glues & Bonding           ◄ products
    └─ Concrete Admixtures       ◄ products

14. Hardware & Fasteners  (Quincaillerie)
    ├─ Fasteners
    │   ├─ Nails (Clous)         ◄ products
    │   ├─ Screws & Bolts        ◄ products
    │   └─ Anchors & Plugs       ◄ products
    ├─ Locks & Security
    │   ├─ Padlocks              ◄ products
    │   ├─ Door Locks & Handles  ◄ products
    │   └─ Hinges                ◄ products
    └─ Ropes, Chains & Wire      ◄ products

15. Tools & Equipment  (Outillage)
    ├─ Hand Tools
    │   ├─ Masonry Tools (Trowels/Floats) ◄ products
    │   ├─ Measuring Tools       ◄ products
    │   └─ Cutting Tools         ◄ products
    ├─ Power Tools
    │   ├─ Drills & Grinders     ◄ products
    │   └─ Saws                  ◄ products
    └─ Site Equipment
        ├─ Wheelbarrows          ◄ products
        ├─ Mixers                ◄ products
        └─ Ladders & Scaffolding ◄ products

16. Safety & Workwear  (Sécurité & Chantier)
    ├─ PPE (Helmets, Gloves, Boots, Goggles) ◄ products
    ├─ Workwear                  ◄ products
    └─ Site Safety (Cones, Tape, Signage)    ◄ products
```

## How each part relates to the others

### Category ↔ Category (the tree)

- Every category points to its parent via `parentId` (`null` = L1). `depth` is 1, 2, or 3
  and equals `parent.depth + 1`.
- The `◄ products` markers are the **terminal** nodes. A category becomes terminal the
  moment it gains products or variant options — after that it can't be given children, and
  a category that already has children can't be given products. That's why products are
  never placed on an L1/L2 that also has sub-categories.
- Branches don't all bottom out at the same depth: _Blocks & Bricks_ stops at L2, while
  _Cement → Cement → Grey Cement_ uses all three.

### Category ↔ Brand (many-to-many)

Brands attach to categories through the `brand_categories` join, so one brand can span
several categories and one category lists many brands. Examples:

| Brand                       | Linked category            |
| --------------------------- | -------------------------- |
| Cimencam, Dangote Cement    | Grey Cement / White Cement |
| Seigneurie, Prime, Colombia | Paints                     |
| Bosch, Ingco, Total Tools   | Power Tools                |
| Polytank                    | Tanks                      |

When someone adds a product under a leaf and picks a brand, the brand picker is filtered to
brands linked to that category's branch.

### Brand ↔ Model (one-to-many, brand-scoped)

Models hang off a **brand**, not a category. Most useful for manufactured goods here — e.g.
`Bosch` → `GSB 550`, `GWS 900`; `Grohe` → tap models. For bulk materials (sand, rebar,
cement) models are usually left empty.

### What stays off the tree (use variants / attributes instead)

Rebar diameter (8/10/12/16 mm), cement grade (32.5 / 42.5), tile size (30×30, 60×60), sheet
thickness/gauge, block size (15/20 cm), paint colour and tin size — all belong as **variant
attributes** on the SKU, not as extra category levels. This keeps the tree inside the
3-level cap and avoids hundreds of near-duplicate leaves.
