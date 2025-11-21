# 🌀 Complete Documentation: Kuramoto Oscillators with WebGPU

## Table of Contents

1. Introduction
2. Mathematical Foundation
3. Core Coupling Rules
4. Spatiotemporal Patterns
5. System Parameters
6. Initial Conditions
7. Visualization & Analysis
8. Implementation Details

---

## Introduction

### What is the Kuramoto Model?

The **Kuramoto model** is a fundamental framework in **nonlinear dynamics** and **complex systems** that describes how a large ensemble of coupled oscillators (pendulums, neurons, generators, etc.) synchronize with one another. Despite each oscillator having its own natural frequency, the coupling between them can drive the entire system toward coherence.

### Historical Context

Introduced by **Yoshiki Kuramoto** in 1975, this deceptively simple model exhibits:
- **Phase transitions** (order-disorder transitions)
- **Spontaneous pattern formation** (waves, spirals, chimera states)
- **Multistability** (coexistence of different synchronized states)
- **Complex spatiotemporal dynamics** (chaos, turbulence)

### Real-World Applications

| Domain | Example |
|--------|---------|
| **Neuroscience** | Brain synchronization, seizures, consciousness |
| **Power Systems** | Grid stability, cascading failures |
| **Biology** | Firefly flashing, circadian rhythms |
| **Chemistry** | Oscillating reactions, coupled chemical clocks |
| **Physics** | Superconductors, laser arrays, plasma |

---

## Mathematical Foundation

### The Basic Kuramoto Equation

The fundamental equation governing each oscillator $i$ is:

$$\frac{d\theta_i}{dt} = \omega_i + \frac{K}{N} \sum_{j=1}^{N} \sin(\theta_j - \theta_i)$$

**Where:**
- $\theta_i(t)$ = phase of oscillator $i$ at time $t$ (in radians, $[0, 2\pi]$)
- $\omega_i$ = **natural frequency** of oscillator $i$ (intrinsic oscillation rate)
- $K$ = **coupling strength** (how strongly oscillators influence each other)
- $N$ = total number of oscillators
- $\sin(\theta_j - \theta_i)$ = **phase difference coupling** (the interaction term)

### Physical Intuition

```
Think of each oscillator as a pendulum or rotating wheel:

1. Natural frequency (ω):
   - Each pendulum wants to swing at its own rate
   - If alone, it would maintain this frequency forever
   
2. Coupling term (K·sin(θⱼ - θᵢ)):
   - Pendulum i "feels" other pendulums nearby
   - If θⱼ > θᵢ: other pendulums are ahead → speed up
   - If θⱼ < θᵢ: other pendulums are behind → slow down
   - Maximum influence when they're 90° out of phase
   
3. Time evolution (dθ/dt):
   - Each pendulum adjusts its rotation based on:
     a) Its own natural tendency (ω)
     b) Pressure from neighboring pendulums (K term)
   - Over time, local interactions create global patterns
```

### The Sine Coupling Function

The term $\sin(\theta_j - \theta_i)$ is crucial:

```
      sin(Δθ)
        ↑
      1 |      ╱╲
        |    ╱    ╲
      0 |──╱────────╲──
        |╱            ╲
     -1 |              ╲╱
        └─────────────────→ Δθ = θⱼ - θᵢ
        0    π/2    π    3π/2
        
- At Δθ = 0°:   sin(0) = 0    (no coupling)
- At Δθ = 90°:  sin(π/2) = 1  (maximum acceleration)
- At Δθ = 180°: sin(π) = 0    (balanced, but unstable)
```

**This asymmetry is key:** Coupling strength depends on phase **difference**, not absolute phase.

---

## Core Coupling Rules

Our implementation extends the basic Kuramoto model with 6 different coupling rules. Each captures different physical phenomena.

### Rule 0: Classic Kuramoto

The standard all-to-all (or local) coupling:

$$\frac{d\theta_i}{dt} = \omega_i + K \langle \sin(\theta_j - \theta_i) \rangle_{\text{neighbors}}$$

**Characteristics:**
- Simplest dynamics
- Linear neighborhood interaction
- Tends toward **global synchronization** for $K > K_c$ (critical coupling)
- Exhibits sharp **phase transition** from disorder → order

**When to use:**
- Learning the basics
- Fast simulations (minimal computation)
- Studying synchronization transitions

**Mathematical detail:**
If **global coupling** is enabled, the sum includes all $N$ oscillators:
$$\langle \sin(\theta_j - \theta_i) \rangle = \frac{1}{N-1} \sum_{j \neq i} \sin(\theta_j - \theta_i)$$

If **local coupling** with range $r$ is used:
$$\langle \sin(\theta_j - \theta_i) \rangle = \frac{1}{2r+1} \sum_{|j-i| \leq r} \sin(\theta_j - \theta_i)$$

---

### Rule 1: Coherence-Gated Coupling

Coupling strength adapts based on **local synchrony**:

$$\frac{d\theta_i}{dt} = \omega_i + K(1 - 0.8 R_i) \langle \sin(\theta_j - \theta_i) \rangle$$

Where the **local order parameter** is:

$$R_i = \left| \frac{1}{M} \sum_{j \in N_i} e^{i\theta_j} \right| \in [0, 1]$$

**Interpretation:**
- $R_i \approx 1$: neighbors are synchronized → coupling **weakens** (they're already aligned)
- $R_i \approx 0$: neighbors are chaotic → coupling **strengthens** (try to synchronize them)

**Physical analogy:** Like a teacher talking louder when students aren't paying attention, then quieting down when they're focused.

**Effect:**
- Creates **grain boundaries** and **domain walls** (sharp transitions between synchronized regions)
- Allows coexistence of ordered and disordered regions
- Produces **pattern fragmentation** rather than global order

**When to use:**
- Studying pattern formation
- Modeling adaptive coupling systems
- Understanding boundary stabilization

---

### Rule 2: Curvature-Aware Coupling

Coupling strength depends on **phase curvature** (local phase acceleration):

$$\frac{d\theta_i}{dt} = \omega_i + K \cdot \min(1, 2|L_i|) \cdot L_i$$

Where $L_i$ is the **phase Laplacian**:
$$L_i = \frac{1}{M} \sum_{j \in N_i} \sin(\theta_j - \theta_i)$$

**Interpretation:**
- Large $|L_i|$: strong phase gradient → amplify coupling (sharpen boundaries)
- Small $|L_i|$: weak gradient → reduce coupling (smooth regions)

**Physical meaning:** Detects where the phase field is "bending" sharply and reinforces those boundaries.

**Effect:**
- Enhances **wave fronts** and **spiral arms**
- Creates **sharper, more stable patterns**
- Better for visualizing **traveling waves** and **vortices**

**Mathematical property:** 
- The factor $\min(1, 2|L_i|)$ saturates the amplification
- Prevents unrealistic divergence at steep gradients

**When to use:**
- Viewing **spiral patterns** (more visually clear)
- Studying **pattern stability**
- Creating **high-contrast visualizations**

---

### Rule 3: Harmonic Coupling

Uses multiple **frequency harmonics** for richer dynamics:

$$\frac{d\theta_i}{dt} = \omega_i + K \left[ \sin(\theta_j - \theta_i) + a_2 \sin(2(\theta_j - \theta_i)) + a_3 \sin(3(\theta_j - \theta_i)) \right]$$

**Harmonic breakdown:**

| Harmonic | Term | Preferred Phase Diff | Effect |
|----------|------|----------------------|--------|
| 1st ($n=1$) | $\sin(\Delta\theta)$ | 0° | Classical sync (both at same phase) |
| 2nd ($n=2$) | $\sin(2\Delta\theta)$ | 180° | Anti-phase clustering (opposite phases) |
| 3rd ($n=3$) | $\sin(3\Delta\theta)$ | 120°, 240° | Three-cluster patterns |

**Graphical representation:**

```
n=1: sin(Δθ)
      ╱╲        (pulls toward 0°)
    ╱    ╲

n=2: sin(2Δθ)
    ╱╲  ╱╲      (pulls toward 0° AND 180°)
  ╱    ╱  ╲

n=3: sin(3Δθ)
   ╱╲  ╱╲  ╱╲   (pulls toward 0°, 120°, 240°)
  ╱  ╱  ╱  ╱ ╲
```

**Multistability:**
With non-zero harmonic coefficients, the system becomes **multistable** — multiple equilibrium states can coexist:

$$a_2 = 0.0: \text{ Global synchronization (single attractor)}$$
$$a_2 = 0.4: \text{ Two-cluster state (two attractors: }0° \text{ and } 180°)$$
$$a_2 = 0.6: \text{ More fragmented two-cluster state}$$

**Parameter Ranges:**
- $a_2 \in [0, 1]$: strength of 2nd harmonic (default: 0.4)
- $a_3 \in [0, 1]$: strength of 3rd harmonic (default: 0.0)

**When to use:**
- Studying **multi-cluster formations**
- Modeling systems with **natural antiphase coupling** (e.g., some neural networks)
- Creating **checkerboard patterns** and **triplet states**

**Biological relevance:** Some neuronal circuits preferentially synchronize at phase differences other than 0°, which this rule captures.

---

### Rule 4: Non-Local Kernel (Mexican-Hat)

Uses a **spatially dependent coupling kernel** instead of simple neighborhoods:

$$\frac{d\theta_i}{dt} = \omega_i + K \sum_j w(r_{ij}) \sin(\theta_j - \theta_i)$$

Where the kernel is a **Mexican-hat** (sombrero-shaped) function:

$$w(r) = \exp\left(-\frac{r^2}{2\sigma^2}\right) - \beta \exp\left(-\frac{r^2}{2\sigma_2^2}\right)$$

**Components:**

1. **Excitatory lobe** (Gaussian, width $\sigma$):
   $$w_{\text{exc}}(r) = \exp\left(-\frac{r^2}{2\sigma^2}\right)$$
   - Short-range attraction
   - Synchronizes nearby oscillators

2. **Inhibitory lobe** (Gaussian, width $\sigma_2 > \sigma$, strength $\beta$):
   $$w_{\text{inh}}(r) = -\beta \exp\left(-\frac{r^2}{2\sigma_2^2}\right)$$
   - Long-range repulsion
   - Desynchronizes distant oscillators

**Visual profile:**

```
      w(r)
        ↑
      1 |   ╱╲
        |  ╱  ╲
      0 |╱──────╲─────
        |        ╲╱╲
     -β |          ╲╱╲
        └──────────────→ r
        0     σ    σ₂
        
        ↑
     excite
     (blue)
        
      inhibit
      (red)
        ↓
```

**Parameter interpretation:**

| Parameter | Range | Effect |
|-----------|-------|--------|
| $\sigma$ | 0.3 - 4.0 | Width of excitatory region (larger = broader synchronization) |
| $\sigma_2$ | 0.3 - 6.0 | Width of inhibitory region (larger = extends further) |
| $\beta$ | 0.0 - 1.5 | Inhibition strength (larger = stronger repulsion) |
| Ratio $\sigma_2/\sigma$ | 2.5 - 3.0 | Critical for pattern formation |

**Key property:** The Mexican-hat is **the kernel that enables chimera states** (coexistence of synchronized and chaotic regions).

**Pattern formation mechanism:**

```
σ = 1.2, σ₂ = 2.2, β = 0.6:

Near distance:   EXCITE → oscillators sync up
Intermediate:    Zero crossing (transition)
Far distance:    INHIBIT → oscillators push apart

Result: Local clusters form and repel each other
        → Spatially patterned synchronization
```

**When to use:**
- **Chimera states** (one of the most interesting phenomena)
- **Self-organized pattern formation**
- Modeling neural fields and cortical dynamics
- Studying **critical phenomena** and bifurcations

**Computational note:** Rule 4 is the slowest because it evaluates all-to-all distances up to $3\sigma_2$ cutoff.

---

### Rule 5: Delay-Coupled

Uses **past phase information** from $\tau$ timesteps ago:

$$\frac{d\theta_i}{dt} = \omega_i + K \sum_{j \in N_i} \sin(\theta_j(t - \tau) - \theta_i(t))$$

**Key difference:**
- Couples current phase to **delayed past phases** of neighbors
- Creates **temporal feedback loop**

**Physical interpretation:**
- Represents finite **signal propagation time**
- Models communication delays in real systems
- Creates **traveling wave instability**

**Mathematical consequence:**

The delay introduces a **phase lag** that can destabilize synchronous states:

```
Current phase θᵢ(t)
         ↑
         |  ─ ─ ─ ─ ─
         | │
         |│
         |  (feedback from τ steps ago)
         ↓
Delayed phase θⱼ(t-τ)
```

When the delay is comparable to the oscillation period, this creates:
- **Spontaneous waves** (even from perturbed synchronized states)
- **Rotating spirals** (without requiring initial spiral structure)
- **Spatiotemporal chaos**

**Parameter:**
- **Delay Steps** ($\tau$): 1 - 30 timesteps
  - Small $\tau$ (1-5): weak effects, coupled to recent state
  - Medium $\tau$ (10-15): strong pattern emergence
  - Large $\tau$ (20-30): chaotic behavior

**When to use:**
- Understanding **effect of time delays** on synchronization
- Modeling **neural transmission delays** and **circuit delays**
- Creating **emergent patterns** from initially uniform states

---

## Spatiotemporal Patterns

### Overview of Pattern Formation

Different combinations of coupling rules, initial conditions, and parameters create distinct spatiotemporal patterns:

```
Pattern Formation Hierarchy:

                     ┌─ Global Synchronization
                     │
            Initial  ├─ Grain Domains (fragmented order)
            Conditions │
            + Rules   ├─ Traveling Waves
            + Params  │  ├─ Plane Waves
                      │  └─ Target Waves
                      │
                      ├─ Rotating Patterns
                      │  ├─ Single Spiral
                      │  ├─ Spiral Pairs
                      │  └─ Spiral Turbulence
                      │
                      ├─ Chimera States
                      │  └─ (Part order, part chaos)
                      │
                      └─ Spatiotemporal Chaos
                         └─ Turbulence
```

---

### Pattern 1: Global Synchronization

**Initial Conditions:**
- Theta: Random phases
- Omega: Uniform or narrow distribution
- K0: Strong coupling (≥ 1.5)
- Global coupling: Enabled

**What happens:**

All oscillators **lock to the same frequency** and converge to nearly identical phases. The system reaches a **synchronized fixed point**:

$$\theta_i(t \to \infty) \approx \Omega t + \phi$$

where $\Omega$ is a **common frequency** and $\phi$ is a constant phase offset.

**Mathematical characterization:**

The **order parameter** reaches maximum:

$$Z(t) = \left| \frac{1}{N} \sum_i e^{i\theta_i(t)} \right| \to 1$$

**Visual signature:**
- Entire grid appears as **single uniform color** (phase maps to color)
- Height field is perfectly sinusoidal
- **No spatial variation**

**Time to achieve:** ~100-500 steps (depends on $K$ and initial spread)

**Physical analogy:** Like clapping audience members gradually synchronizing their hands.

---

### Pattern 2: Grain Domains

**Initial Conditions:**
- Theta: Random or gradient
- Omega: Random or checkerboard
- K0: Moderate coupling (0.6 - 1.2)
- Rule: Coherence-gated (Rule 1) recommended

**What happens:**

System spontaneously **fragments into multiple synchronized domains** separated by sharp boundaries:

```
Synchronized   Grain      Synchronized
Region A     Boundary     Region B
─────────────────────────────────────
(uniform     (sharp       (uniform
 color)     transition)   color)
```

**Why it forms:**

The coherence-gated rule **weakens coupling in already-synchronized regions** (where $R_i \approx 1$) while **strengthening it in disordered regions** (where $R_i \approx 0$). This creates:

1. Each domain synchronizes internally
2. Boundaries between domains **resist merging**
3. Multiple stable equilibria coexist

**Mathematical property:**

Each grain is a **metastable state** — stable on short timescales but can merge given enough time or perturbation.

**Visual signature:**
- Grid divided into 3-8 colored regions
- Sharp, well-defined boundaries
- Each region oscillates coherently
- Boundaries may slowly drift or rotate

**Characteristic size:** Determined by coupling range and $K$ value

---

### Pattern 3: Plane Waves

**Initial Conditions:**
- Theta: **Linear gradient** $\theta_i = k \cdot x_i$ (phase increases across space)
- Omega: **Uniform** (all oscillators same frequency)
- K0: Moderate coupling (0.8 - 1.2)
- Rule: Classic Kuramoto (Rule 0)

**What happens:**

A **phase wave travels across the grid** at constant velocity:

$$\theta_i(x,t) = k(x - vt)$$

where $v$ is the **wave velocity**.

**Wave equation:**

In the continuum limit, the system supports **traveling wave solutions**:

$$\frac{\partial \theta}{\partial t} = \omega - v \frac{\partial \theta}{\partial x} + K \sin\left(\frac{\partial \theta}{\partial x}\right)$$

**Visual signature:**
- **Parallel stripes** move smoothly across the grid
- Stripe orientation corresponds to wave direction
- Stripes remain **sharply defined** (no diffusion)
- Periodic in space: wavelength $\lambda = 2\pi/k$

**Traveling wave speed:**

For small coupling, the wave speed is approximately:

$$v \approx \omega \left( 1 - \frac{K}{2\omega^2} + \mathcal{O}(K^2) \right)$$

**Parameters for our implementation:**
- **Wavelength** (in grid cells): 12-20 (default: 15)
- **Wave direction**: 45° (diagonal)
- **Omega amplitude**: 0.2 (controls propagation speed)

**Physical relevance:**
- Models **electrical waves** in cardiac tissue
- Describes **chemical waves** in oscillating reactions
- Relevant to **neural signal propagation**

---

### Pattern 4: Target Waves (Concentric)

**Initial Conditions:**
- Theta: **Radial phase gradient** $\theta_i \propto r$ (phase increases outward from center)
- Omega: **Radially decreasing** (fast at center, slow at edges)
- K0: Moderate coupling (1.0 - 1.2)
- Rule: Classic Kuramoto

**What happens:**

**Expanding circular waves** emanate from a central pacemaker:

$$\theta_i(r,t) = k(r - ct)$$

where the center oscillates faster than the periphery.

**Mechanism:**

The **pacemaker** (center) has $\omega_c > \omega_{\text{periphery}}$:

1. Center oscillates faster → pushes neighbors forward → wave of synchronization expands outward
2. Each ring of oscillators synchronizes with its immediate neighbors
3. Result: concentric "ripples"

**Visual signature:**
- **Concentric rings** or **expanding circles**
- Rings move smoothly outward
- Ring spacing = wavelength
- Reminiscent of dropping stone in water

**Mathematical description:**

In 2D, the expanding wavefront satisfies:

$$\frac{\partial \theta}{\partial t} = \omega(r) + K\nabla^2\theta$$

where $\omega(r) = \omega_0 e^{-r^2/(2\sigma^2)}$ (Gaussian pacemaker).

**Parameter tuning:**
- **Central frequency**: $\omega_c = 0.3$ (must be > peripheral)
- **Peripheral frequency**: $\omega_p = 0.05$
- **Wavelength**: 12 grid units
- **Coupling range**: 2-3 cells

**When observed naturally:**
- **Cardiac tissue**: pacemaker cells drive heartbeat waves
- **Retinal waves**: developing eye has spontaneous traveling waves
- **Slime mold** (*Physarum*): chemical waves from oscillating center

---

### Pattern 5: Spiral Waves

#### Single Spiral

**Initial Conditions:**
- Theta: **Angular gradient** $\theta_i = \arg(x_i, y_i)$ (phase equals angle around center)
- Omega: **Radial function** (gradient away from center)
- K0: Strong coupling (1.2)
- Rule: Classic (Rule 0) or Curvature-aware (Rule 2, recommended for sharper patterns)

**What happens:**

A **rotating spiral pattern** emerges with a **topological defect** at the center:

```
        ╲ │ ╱
         ╲│╱
    ──────●────── (defect core)
         ╱│╲
        ╱ │ ╲

Arrows show rotating phase
```

**Mathematical structure:**

A spiral wave has **winding number** (topological charge):

$$q = \frac{1}{2\pi} \oint \nabla\theta \cdot d\mathbf{l} = \pm 1$$

The line integral of phase around the center equals $\pm 2\pi$ (one full rotation).

**Defect core:**

At the very center ($r = 0$), the **phase is undefined**. This is a **topological defect** of strength $q = +1$ (or $-1$ for opposite chirality).

**Spiral tip dynamics:**

The defect core typically **rotates rigidly** around the center with angular velocity $\Omega$:

$$\theta(r, \phi, t) = \phi + f(r) + \Omega t$$

**Visual signature:**
- **Pinwheel pattern** rotating smoothly
- Sharp, rotating **spiral arms**
- Color varies as pattern rotates
- **Height varies sinusoidally** around the spiral

**Chirality:**

- **Right-handed** ($q = +1$): spiral rotates clockwise
- **Left-handed** ($q = -1$): spiral rotates counter-clockwise

**Rotation period:**

Depends on frequency distribution:

$$T_{\text{rot}} = \frac{2\pi}{\Omega} \approx \frac{10-20}{K \cdot \Delta\omega}$$

where $\Delta\omega$ is the frequency variation.

**Time to formation:** ~2-5 seconds (requires time for gradient structure to establish)

---

#### Spiral Pairs

**Initial Conditions:**
- Theta: **Two spiral centers** with opposite chirality
- Omega: Uniform
- K0: Strong coupling (1.2)
- Rule: Classic (Rule 0)

**What happens:**

**Two counter-rotating spirals** orbit around each other:

```
Time t₁:          Time t₂:          Time t₃:
  ╱╲   ╱╲          ╲╱ ╱╱            ╲╱   ╱╱
 ╱  ╲ ╱  ╲        ╱  ╳  ╲          ╱  ╲╱  ╲
╱ +1 ╳ -1 ╲  →  ╱ -1 ╳ +1 ╲  →  ╱ +1 ╳ -1 ╲
╲    ╳    ╱      ╲    ╳    ╱      ╲    ╳    ╱
 ╲  ╱ ╲  ╱        ╲  ╳  ╱          ╲  ╱ ╲  ╱
  ╲╱   ╲╱          ╱╲ ╲╱            ╱╲   ╲╱
 (rotate)        (orbit)           (rotate)
```

**Mechanism:**

Two defects with opposite topological charges create a **quadrupole field**. Rather than annihilating each other (which would require passing through each other), they orbit around a mutual center while rotating individually.

**Conservation laws:**

Total topological charge is conserved:

$$Q_{\text{total}} = \sum_i q_i = (+1) + (-1) = 0$$

but individual charges persist because they cannot pass through one another.

**Orbital motion:**

The pair rotates as a unit around their center of mass:

$$\mathbf{r}_1(t) = r_0[\cos(\Omega_{\text{orb}} t), \sin(\Omega_{\text{orb}} t)]$$
$$\mathbf{r}_2(t) = -\mathbf{r}_1(t)$$ (on opposite side)

where $\Omega_{\text{orb}} \ll \Omega_{\text{rot}}$ (orbiting is slower than spinning).

**Visual signature:**
- **Two rotating spirals** visible on opposite sides
- Spiral **arms interlock**
- Pair slowly orbits around mutual center
- Can eventually merge or escape

---

### Pattern 6: Chimera State (Most Interesting!)

**Initial Conditions:**
- Theta: **Split domain** (left synchronized, right random)
- Omega: Heterogeneous
- K0: Moderate (1.2)
- Rule: **Non-Local Kernel** (Rule 4) — ESSENTIAL
- Parameters: $\sigma = 1.5$, $\sigma_2 = 3.0$, $\beta = 0.5$ (Mexican-hat crucial)

**What happens:**

**Coexistence of synchronized and chaotic regions** despite identical oscillators and symmetric coupling:

```
Grid state:
     Synchronized    |    Desynchronized
     ═══════════════╬═══════════════════
     (uniform)      |    (colorful chaos)
     Region A       |    Region B
```

This is **chimera state** — one of the most fascinating phenomena in nonlinear dynamics.

**Mathematical characterization:**

The system reaches a **spatially heterogeneous steady state** where:

$$R_{\text{left}} = \left| \frac{1}{N_L} \sum_{i \in \text{left}} e^{i\theta_i} \right| \approx 1$$
$$R_{\text{right}} = \left| \frac{1}{N_R} \sum_{i \in \text{right}} e^{i\theta_i} \right| \approx 0$$

**Why does it exist?**

The Mexican-hat kernel creates a **bistability**:

1. **Short-range excitation** ($\sigma$-lobe):
   - Synchronizes nearby oscillators
   - Creates local coherence
   
2. **Long-range inhibition** ($\sigma_2$-lobe with $\beta$):
   - Keeps distant oscillators desynchronized
   - Prevents global coherence

This combination allows **self-organized separation** into ordered and disordered domains.

**Critical kernel ratio:**

The phenomenon requires:

$$\frac{\sigma_2}{\sigma} \approx 2.5-3.0$$

Too small: system fully synchronizes
Too large: system fully desynchronizes
Just right: chimera can exist

**Stability:**

Chimera states are **stable but fragile**:
- Persist for hundreds of timesteps
- Can be destroyed by strong noise
- Boundary can slowly drift
- Adding spatial asymmetry breaks the chimera

**Biological relevance:**

May explain:
- **Unihemispheric sleep** in birds and dolphins (one half brain awake, other asleep)
- **Neural oscillation heterogeneity** in brain networks
- **Seizure dynamics** where some brain regions are active while others are quiet

**How to observe:**
1. Load "Chimera State" preset
2. Watch initial condition with sharp boundary
3. Order overlay (O key) shows boundary clearly
4. Try adjusting $\beta$ to see stability effect

---

### Pattern 7: Turbulence (Spatiotemporal Chaos)

**Initial Conditions:**
- Theta: Smooth random field (spatially correlated)
- Omega: Heterogeneous (multiple frequency clusters)
- K0: Weak coupling (0.6)
- Rule: Coherence-gated (Rule 1) or Curvature-aware (Rule 2)
- Perturbations: **Noise required** (strength 0.1-0.3)

**What happens:**

**Chaotic, ever-changing patterns** with multiple competing domains and defects:

```
Turbulent state:
╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲  (no identifiable structure)
╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱  (multiple vortices and waves)
╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲  (constant reorganization)
```

**Mechanism:**

- **Weak coupling** (K0 < Kc): cannot drive global coherence
- **Frequency heterogeneity**: no natural common frequency
- **Noise**: provides continuous perturbation
- **Result**: System never settles into stationary state

**Lyapunov exponent:**

In turbulent regime, the largest Lyapunov exponent is **positive**:

$$\lambda_1 > 0$$

This measures exponential divergence of nearby trajectories:

$$\delta\theta(t) \approx \delta\theta(0) e^{\lambda_1 t}$$

Small differences grow exponentially → **sensitive dependence on initial conditions** (hallmark of chaos).

**Visual signature:**
- **Rapidly changing colors** across grid
- Multiple vortex cores appearing and disappearing
- **No persistent patterns**
- "Boiling" appearance
- Order parameter $R(t)$ fluctuates wildly

**Entropy:**

Information-theoretic entropy is **maximal**:

$$S = -\sum_p p_i \log p_i \to \text{maximum}$$

The system explores many states rapidly.

**Timescales:**

- Eddy turnover time: $\tau_{\text{eddy}} \sim 1/K$
- Correlation decay time: $\tau_c \sim 5-10$ steps
- Pattern reorganization time: $\tau_{\text{org}} \sim 10-20$ steps

**When observed naturally:**
- **Fully turbulent fluids** (air at high speed)
- **Cardiac fibrillation** (chaotic heart rhythms)
- **Plasma turbulence** in fusion reactors
- **Atmospheric chaos** (weather prediction limits)

---

### Pattern 8: Breathing Mode

**Initial Conditions:**
- Theta: **Gaussian blob** $\theta_i = A e^{-r^2/(2\sigma^2)}$ (strong at center, weak at edges)
- Omega: Radially modulated
- K0: Moderate (1.0)
- Rule: Non-Local Kernel (Rule 4)
- Parameters: $\sigma = 1.2$, $\sigma_2 = 2.5$, $\beta = 0.6$

**What happens:**

A **central region oscillates periodically** in amplitude while remaining synchronized:

```
Time t₁:        Time t₂:         Time t₃:
  Expansion      Contraction      Expansion
   ╱───╲         ╱─╲              ╱───╲
  │     │       │   │            │     │
  │  ●  │       │●●●│            │  ●  │
  │     │       │   │            │     │
   ╲───╱         ╲─╱              ╲───╱

(Phase: all moving together, amplitude varies)
```

**Mechanism:**

The Mexican-hat kernel creates an **oscillating instability** in the gaussian blob:

1. **Expansion phase**: Excitatory lobe dominates → blob grows
2. **Maximum**: Blob reaches peak size
3. **Contraction phase**: Inhibitory lobe dominates → blob shrinks
4. **Minimum**: Blob reaches minimum size
5. Cycle repeats

**Period of oscillation:**

$$T_{\text{breath}} \approx \frac{2\pi}{\Omega_{\text{breath}}}$$

where the breathing frequency depends on:

$$\Omega_{\text{breath}} \propto K \cdot (\sigma_2 - \sigma) / \sigma_2$$

Larger $\sigma_2 - \sigma$ → faster oscillation
Larger $\sigma$ → slower oscillation

**Order parameter:**

During breathing:
- $R(t) \approx 1$ always (remains synchronized)
- **Amplitude $|Z(t)|$** oscillates: $|Z(t)| = A + B\cos(\Omega_{\text{breath}} t)$

**Visual signature:**
- Central colored region **expands and contracts**
- Region remains **coherently colored** (well-defined phase)
- Motion is **periodic and predictable**
- Surrounding region remains stable

**Biological analogy:**

Similar to:
- **Beating heart cells** (synchronized contraction/relaxation)
- **Breathing patterns** in neural populations
- **Oscillating enzyme clusters** in glycolysis

**How to observe:**
1. Load "Breathing Mode" preset
2. Watch central region pulse
3. Use Velocity colormap (C key) to see motion
4. Adjust $\beta$ to speed up/slow down breathing

---

## System Parameters

### Simulation Parameters

| Parameter | Symbol | Range | Default | Effect |
|-----------|--------|-------|---------|--------|
| **Grid size** | GRID | 64-512 | 256 | Number of oscillators per side ($N = \text{GRID}^2$) |
| **Time step** | $\Delta t$ | 0.001-0.1 | 0.03 | Integration step size; larger = faster but less stable |
| **Coupling strength** | $K_0$ | 0 - 3.0 | 1.0 | Overall coupling amplitude |
| **Neighborhood range** | $r$ | 1 - 8 | 2 | Number of cells in each direction for local coupling |
| **Global coupling** | toggle | on/off | off | If on: each oscillator sees all others; if off: only neighbors |

### Oscillator Parameters

| Parameter | Symbol | Range | Default | Effect |
|-----------|--------|-------|---------|--------|
| **Natural frequency** | $\omega_i$ | -1.0 to 1.0 | varies | Intrinsic oscillation rate of oscillator $i$ |
| **Frequency amplitude** | - | 0.0 - 2.0 | 0.4 | Controls spread of $\omega$ distribution |
| **Frequency pattern** | - | 5 options | uniform | How $\omega$ values are distributed spatially |

**Frequency patterns:**
- **Random**: Gaussian-distributed, uncorrelated
- **Uniform**: All oscillators identical
- **Gradient**: Linearly varies across grid
- **Checkerboard**: Alternating fast/slow regions
- **Center fast**: Gaussian peak at center (pacemaker)

### Rule-Specific Parameters

#### Rule 1: Coherence-Gated
- **Adaptation factor**: 0.8 (fixed)
  - Controls how strongly coupling weakens in synchronized regions

#### Rule 3: Harmonics
| Parameter | Symbol | Range | Default | Effect |
|-----------|--------|-------|---------|--------|
| **2nd harmonic coeff.** | $a_2$ | 0 - 1.0 | 0.4 | Strength of 180° anti-phase attraction |
| **3rd harmonic coeff.** | $a_3$ | 0 - 1.0 | 0.0 | Strength of 120° three-cluster attraction |

**Guidelines:**
- $a_2 = 0$: Pure global sync
- $a_2 = 0.3-0.5$: Clear two-cluster formation
- $a_3 = 0.2-0.4$: Three-cluster patterns (with $a_2 \approx 0$)

#### Rule 4: Non-Local Kernel (Mexican-Hat)
| Parameter | Symbol | Range | Default | Effect |
|-----------|--------|-------|---------|--------|
| **Excitation width** | $\sigma$ | 0.3 - 4.0 | 1.2 | Gaussian width of short-range excitatory lobe |
| **Inhibition width** | $\sigma_2$ | 0.3 - 6.0 | 2.2 | Gaussian width of long-range inhibitory lobe |
| **Inhibition strength** | $\beta$ | 0 - 1.5 | 0.6 | Amplitude of long-range inhibition |

**Tuning guidelines:**
- For **chimera states**: $\sigma_2/\sigma \approx 2.5-3.0$, $\beta = 0.5-0.8$
- For **domains**: $\sigma = 1.5-2.0$, $\sigma_2 = 3.0-4.0$, $\beta = 0.4-0.6$
- For **waves**: $\sigma = 0.5-1.0$, $\sigma_2 = 2.0-3.0$, $\beta = 0.3-0.5$

**Visualization hints:**
- 1D kernel profile (bottom left): shows coupling strength vs. distance
- 2D kernel heatmap (bottom right): blue = excite, red = inhibit

#### Rule 5: Delay-Coupled
| Parameter | Symbol | Range | Default | Effect |
|-----------|--------|-------|---------|--------|
| **Delay steps** | $\tau$ | 1 - 30 | 10 | Time lag (in timesteps) for coupling |

**Effects of delay:**
- $\tau = 1-3$: Minimal effect, coupling nearly instantaneous
- $\tau = 5-15$: Strong pattern emergence, traveling waves
- $\tau = 20-30$: Chaotic behavior, unpredictable dynamics

### Perturbation Parameters

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| **Noise strength** | 0 - 0.5 | 0.0 | Stochastic perturbation amplitude (per oscillator per step) |

**Noise mechanism:**

Each oscillator receives random acceleration:

$$\frac{d\theta_i}{dt} \to \frac{d\theta_i}{dt} + \xi_i(t)$$

where $\xi_i$ is Gaussian white noise: $\xi_i \sim \mathcal{N}(0, \sigma_n^2)$ with $\sigma_n = \text{NOISE\_STRENGTH}$.

**Noise effects:**
- $\sigma_n = 0.0$: Deterministic
- $\sigma_n = 0.05$: Small perturbations, patterns stable
- $\sigma_n = 0.15$: Visible noise, patterns jittery but persist
- $\sigma_n = 0.30$: Significant noise, patterns degrade to turbulence

### Time Control Parameters

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| **Time scale** | 0.1 - 4.0 | 1.0 | Multiplier on $\Delta t$ (slow-motion at <1, fast-forward at >1) |
| **Paused** | on/off | off | If on: freeze all dynamics |

**Keyboard shortcuts:**
- **Space**: Pause/resume
- **[** / **]**: Decrease/increase time scale by 2×
- **↻**: Reset time scale to 1.0×

---

## Initial Conditions

### Phase Pattern (Theta) Options

#### 1. Random
```
θᵢ ~ Uniform(0, 2π)
```
- Each oscillator starts with **independent random phase**
- No spatial structure
- Most generic initial condition
- **When to use**: Testing coupling rules without structure bias

#### 2. Gradient
```
θᵢ(x,y) = k·(x·cos(α) + y·sin(α))

where:
k = 2π/λ (wave number)
λ = wavelength (∼ grid size)
α = gradient direction (45° default)
```
- Creates **phase ramp** across grid
- Directly initializes traveling wave structure
- **When to use**: Creating plane waves, understanding wave propagation

#### 3. Spiral
```
θᵢ = atan2(y - cy, x - cx) + r·c

where:
(cx, cy) = center
r = distance from center
c = chirality parameter (0.1 default)
```
- Phase increases **angularly** around center
- Topological defect at origin
- **When to use**: Initializing spiral patterns

#### 4. Checkerboard
```
θᵢ = (x + y) mod 2 ? π : 0
```
- **Alternating 0° and 180°** phases in grid pattern
- Creates natural two-domain structure
- **When to use**: Two-cluster patterns, harmonic Rule 3

#### 5. Synchronized
```
θᵢ = 0  (all oscillators identical)
```
- All oscillators start **perfectly in phase**
- Zero initial disorder
- Unstable if coupling is heterogeneous
- **When to use**: Studying synchronization stability, measuring desynchronization time

### Omega Pattern (Frequency) Options

#### 1. Random
```
ωᵢ ~ 𝒩(0, σ²)  where σ = amplitude

Box-Muller method:
ω = √(-2 log(u₁)) · cos(2πu₂)  ×  amplitude
```
- **Gaussian-distributed** frequencies around zero
- Natural heterogeneity
- Prevents perfect synchronization (for weak coupling)
- **When to use**: Studying effect of frequency disorder

#### 2. Uniform
```
ωᵢ = ω₀  for all i

where ω₀ = amplitude
```
- **All oscillators identical frequency**
- Maximally coherent
- Easiest to synchronize
- **When to use**: Isolating spatial effects from frequency effects

#### 3. Gradient
```
ωᵢ(y) = (y/height - 0.5) × 2 × amplitude

Range: [-amplitude, +amplitude]
Linear increase from top to bottom
```
- Creates **frequency shear** across grid
- Top region slow, bottom region fast (or vice versa)
- **When to use**: Studying frequency-driven desynchronization, shear-induced patterns

#### 4. Checkerboard
```
ωᵢ = (x + y) mod 2 ? +amplitude : -amplitude
```
- **Alternating fast/slow regions**
- Creates natural two-cluster oscillation
- Complementary to theta checkerboard
- **When to use**: Breathing patterns, domain oscillations

#### 5. Center Fast
```
ωᵢ = amplitude · exp(-r²/(2σ²))

where r = distance from center
σ = GRID/4 (adjustable)
```
- **Gaussian pacemaker** at center
- Center oscillates fast, edges slow
- Drives outward-propagating waves
- **When to use**: Target waves, expanding rings

---

## Neighborhoods and Coupling Range

### Neighborhood Definition

For each oscillator at position $(x, y)$, its **neighborhood** $N_i$ consists of all oscillators within **Manhattan distance** $r$:

$$N_i = \{ j : |x_j - x_i| \leq r \text{ and } |y_j - y_i| \leq r \}$$

**Geometric visualization:**

```
Neighborhood with r=1 (9 oscillators):
  ●  ●  ●
  ●  X  ●
  ●  ●  ●
  
Neighborhood with r=2 (25 oscillators):
  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●
  ●  ●  X  ●  ●
  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●

Neighborhood with r=3 (49 oscillators):
  ●  ●  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●  ●  ●
  ●  ●  ●  X  ●  ●  ●
  ●  ●  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●  ●  ●
  ●  ●  ●  ●  ●  ●  ●
```

**Neighborhood size:**

$$|N_i| = (2r + 1)^2 - 1$$

| r | Grid Size | # Neighbors |
|---|-----------|------------|
| 1 | 3×3 | 8 |
| 2 | 5×5 | 24 |
| 3 | 7×7 | 48 |
| 4 | 9×9 | 80 |

### Global vs. Local Coupling

#### Local Coupling (Default)
```
Each oscillator couples only to its r-neighborhood:

dθᵢ/dt = ωᵢ + K·⟨sin(θⱼ - θᵢ)⟩ⱼ∈Nᵢ
```

**Advantages:**
- **Spatially local**: Respects spatial causality
- **Computationally efficient**: O(r²) per oscillator instead of O(N)
- **Physical realism**: Real systems don't have infinite range
- **Pattern formation friendly**: Enables waves, spirals, domains

**Disadvantages:**
- **Harder to synchronize**: Requires larger K to reach global coherence
- **Boundary effects**: Edge oscillators have fewer neighbors

#### Global Coupling
```
Each oscillator couples to ALL oscillators:

dθᵢ/dt = ωᵢ + K·⟨sin(θⱼ - θᵢ)⟩ⱼ=1,N
```

**Advantages:**
- **Easier synchronization**: Much smaller critical coupling $K_c$
- **Mean-field behavior**: Simplest theoretical analysis
- **Sharp phase transitions**: Clear order-disorder boundaries

**Disadvantages:**
- **Spatially non-local**: Requires action at a distance
- **Computationally expensive**: O(N) per oscillator
- **No pattern formation**: Suppresses waves and spirals

**When to use:**
- **Local**: Studying patterns, realistic systems, fastest computation
- **Global**: Studying synchronization transitions, mean-field behavior

### Periodic Boundary Conditions

The grid uses **toroidal (periodic) boundary conditions**:

```
Edge wrapping:
    
   0 1 2 3 4 (wraps to 0)
   
   
   (wraps to 0)
```

This ensures:
- **No boundaries**: All oscillators equivalent
- **Translational symmetry**: Patterns wrap around
- **Waves travel indefinitely**: No reflection

**Consequence:** A wave traveling off the right edge appears on the left edge.

---

## Kernels in Detail

### Mexican-Hat Kernel (Rule 4)

The **Mexican-hat** (or **Ricker wavelet**) is a spatially extended coupling function that combines **short-range excitation** and **long-range inhibition**.

**Functional form:**

$$w(r) = \exp\left(-\frac{r^2}{2\sigma_{\text{in}}^2}\right) - \beta \exp\left(-\frac{r^2}{2\sigma_{\text{out}}^2}\right)$$

Where:
- $r$ = Euclidean distance: $r = \sqrt{(\Delta x)^2 + (\Delta y)^2}$
- $\sigma_{\text{in}} = \sigma$ (inner Gaussian width)
- $\sigma_{\text{out}} = \sigma_2$ (outer Gaussian width)
- $\beta$ = inhibition strength

**Graphical profile:**

```
        w(r)
          ↑
        1 |    ╱╲
          |   ╱  ╲
        0 |──╱────╲────
          |   ╲╱╲
       -β |    ╲ ╲╱
          └─────────────→ r
          0   σ   σ₂  3σ₂
          
       Excite  Inhibit
```

### Phase Diagram: Parameter Space

The Mexican-hat coupling exhibits rich behavior depending on parameters:

```
           β (inhibition strength)
           ↑
           |  Chimera
        0.8 |  Region
           |  ╱───╲
           | ╱     ╲
        0.5 |╱       ╲
           |╲         ╲
           | ╲ Domain ╲
        0.2 |  ╲ Waves ╲────
           |   ╲       ╲
           └──────────────→ σ₂/σ (size ratio)
           0    2      3    4
```

**Key regions:**

| Region | σ₂/σ | β | Observed Pattern |
|--------|------|---|-----------------|
| Small inhibition | <2.0 | <0.2 | Traveling waves |
| Domain formation | 2.2-2.8 | 0.3-0.6 | Grain domains, rings |
| **Chimera zone** | **2.5-3.0** | **0.5-0.8** | **Coexisting sync/chaos** |
| Strong inhibition | >3.5 | >1.0 | Full desynchronization |

### Kernel Computation in 2D

For a **square grid**, the coupling from oscillator $j$ to oscillator $i$ is:

$$\Delta\theta_{i,j} = K w(d_{ij}) \sin(\theta_j - \theta_i)$$

where $d_{ij}$ is the grid distance:

$$d_{ij} = \sqrt{(x_j - x_i)^2 + (y_j - y_i)^2}$$

**With periodic boundaries**, the distance is:

$$d_{ij} = \sqrt{(\Delta x_{\text{wrap}})^2 + (\Delta y_{\text{wrap}})^2}$$

$$\Delta x_{\text{wrap}} = \min(|\Delta x|, \text{GRID} - |\Delta x|)$$

This ensures the shortest path on a torus.

### Computational Efficiency

**Full all-to-all:** Would require evaluation at every distance

**Optimized implementation:**
1. **Cutoff radius:** Only evaluate $w(r)$ for $r < 3\sigma_2$
2. **Square grid:** Evaluate on rectangular mesh, interpolate
3. **Precomputation:** Precompute kernel table for all distances needed

**Complexity:**
- Per oscillator: O((6σ₂)²) ≈ O(σ₂²)
- Total: O(N·σ₂²) = O(GRID²·σ₂²)

For σ₂ = 3: roughly O(9·N) = O(9·GRID²) operations

---

## Visualization & Analysis

### Colormaps

#### 0. Phase (Default)
Maps **phase angle** to **hue**:

$$\text{color} = \text{HSV}(\theta/2\pi, 1.0, 1.0)$$

**Color sequence:**
- $\theta = 0°$: Blue
- $\theta = 90°$: Cyan
- $\theta = 180°$: Green
- $\theta = 270°$: Yellow
- $\theta = 360°$: Red → back to Blue

**When to use:** Understanding **phase spatial distribution**, visualizing **wave patterns**, seeing **spiral structure**

**Interpretation:**
- Uniform color = synchronized region
- Rainbow gradient = traveling wave
- Rotating rainbow = spiral

#### 1. Velocity (Phase Gradient)
Maps **phase gradient magnitude** to color:

$$\text{velocity} = \sqrt{(\partial\theta/\partial x)^2 + (\partial\theta/\partial y)^2}$$

Color scale:
- Blue: slow (flat phase field)
- Orange: fast (steep phase gradients)

**When to use:** Seeing **motion** and **flow**, detecting **wave fronts**, understanding **dynamical regions**

**Interpretation:**
- Flat blue region: low activity
- Orange bands: active fronts where phase changes
- Rainbows: regions of high motion

#### 2. Curvature (Phase Laplacian)
Maps **phase curvature** (second spatial derivative) to color:

$$\text{curvature} = \nabla^2 \theta = \frac{\partial^2\theta}{\partial x^2} + \frac{\partial^2\theta}{\partial y^2}$$

Color scale:
- Purple: negative curvature (concave)
- Yellow: positive curvature (convex)

**When to use:** Identifying **defect cores** (spiral centers), seeing **bending regions**, understanding **geometric structure**

**Interpretation:**
- Yellow + Purple pairs: spiral arm boundaries
- Sharp transitions: sharp phase gradients
- Smooth regions: slowly varying phase

#### 3. Order Parameter
Maps **local coherence** to color:

$$R_i = \left| \frac{1}{|N_i|} \sum_{j \in N_i} e^{i\theta_j} \right|$$

Color scale:
- Red ($R_i \approx 0$): chaos, desynchronized
- Green ($R_i \approx 1$): order, synchronized

**When to use:** Visualizing **synchronization level**, studying **chimera boundaries**, analyzing **domain coherence**

**Interpretation:**
- Pure green: perfectly synchronized
- Mixed red/green: partially synchronized
- Pure red: completely chaotic

### Order Parameter Overlay

Can enable overlay that **modulates brightness** based on local order:

```
if overlay:
    brightness = 0.4 + 0.6 × Rᵢ
```

**Effect:**
- Synchronized regions: bright
- Chaotic regions: dim
- Highlights synchronization structure

---

### Height Field Visualization

The 3D height $h(x,y,t)$ encodes phase information:

$$h(x, y, t) = A \sin(\theta(x, y, t))$$

where $A = 2.0$ (amplitude).

**Interpretation:**
- **Height at top/bottom of sinusoid**: oscillators near aligned phase
- **Height at middle**: oscillators evenly distributed in phase
- **Wave motion**: height field traveling across grid
- **Spiral rotation**: height rotating around defect

### Keyboard Shortcuts for Visualization

| Key | Action |
|-----|--------|
| **C** | Cycle colormap (0 → 1 → 2 → 3 → 0) |
| **O** | Toggle order parameter overlay |
| **M** | (if implemented) Toggle 3D height visualization |

---

## Implementation Details

### Computational Architecture

```
┌─────────────────────────────────────┐
│   WebGPU Compute Shader             │
│   (Parallel Phase Updates)          │
│   - Reads: θ(t), ω, parameters     │
│   - Writes: θ(t+Δt)                │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│   WebGPU Render Shader              │
│   (Height & Color Computation)      │
│   - Reads: θ(t+Δt), gradients      │
│   - Writes: Color to framebuffer    │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│   Canvas Display                    │
│   (Interactive 3D Visualization)    │
└─────────────────────────────────────┘
```

### GPU Buffers

| Buffer | Size | Purpose | Access |
|--------|------|---------|--------|
| `thetaBuf` | N×4 bytes | Current phases | Read/Write |
| `omegaBuf` | N×4 bytes | Natural frequencies | Read |
| `orderBuf` | N×4 bytes | Local order parameters | Read/Write |
| `paramsBuf` | 80 bytes (20×f32) | Simulation parameters | Read (Uniform) |
| `delayBuffers` | 32×(N×4) | Ring buffer of past theta | Read |

### Numerical Integration

Uses **explicit forward Euler** method:

$$\theta^{n+1}_i = \theta^n_i + \Delta t \cdot f(\theta^n_i, \omega_i, \text{neighbors})$$

**Stability constraint:**

For stability, the CFL condition roughly requires:

$$\Delta t < \frac{1}{K \cdot (\text{max coupling derivative})}$$

For our system with $K \in [0, 3]$, stable range is:

$$\Delta t \in [0.001, 0.05]$$

Default $\Delta t = 0.03$ is safely within this range.

### Phase Unwrapping

Phases are stored in $[0, 2\pi]$, so they wrap:

```
After update: θ ← θ + Δt·(ω + K·sin(...))

If θ > 2π:   θ ← θ - 2π    (reset upper)
If θ < 0:    θ ← θ + 2π    (reset lower)
```

This prevents overflow while maintaining periodic nature.

### Delay Buffer Ring

For delay-coupled rule, past phases are stored in circular buffer:

```
Timestep t:     θ(t) stored at index t % 32
Timestep t+τ:   Read from index (t - τ + 32) % 32

Ring:
  [0] ← oldest
  [1]
  ...
  [31] ← newest (overwrites oldest each step)
```

**Update frequency:**
- Every compute step, delay buffer rotates
- New current phase → buffer position
- Old position overwritten

---

### Performance Optimization

**Grid Size vs. Performance:**

| GRID | N | GPU Time | FPS* |
|------|----------|----------|------|
| 64 | 4,096 | <1 ms | 60+ |
| 100 | 10,000 | ~3 ms | 45-60 |
| 128 | 16,384 | ~5 ms | 30-45 |
| 200 | 40,000 | ~15 ms | 15-30 |
| 256 | 65,536 | ~30 ms | 5-15 |

*Depends on GPU model; modern GPUs (~2020+) achieve higher FPS

**Optimization strategies:**
1. **Workgroup size**: 8×8 = 64 threads per workgroup
2. **Shared memory**: None (data too large)
3. **Coalesced access**: Sequential thread IDs access sequential memory
4. **Avoid divergence**: All threads in workgroup take same execution path

---

## Extended Features (2024 Implementation)

This implementation includes several powerful extensions beyond the basic Kuramoto model:

### 1. 2D/3D View Toggle

**Feature:** Seamlessly switch between 3D height field visualization and 2D top-down view.

**How to use:**
- Press **V** key to toggle between modes
- Or click **"3D"** / **"2D"** buttons in the View & Display panel

**3D Mode (default):**
- Perspective projection with orbital camera
- Height encodes phase: $h(x,y) = 2\sin(\theta(x,y))$
- Camera controls:
  - **Left-drag**: Rotate camera around grid
  - **Right-drag**: Pan camera position
  - **Scroll**: Zoom in/out

**2D Mode:**
- Orthographic top-down projection
- Flat geometry (no height variation)
- Camera controls:
  - **Drag**: Pan across grid
  - **Scroll**: Zoom in/out
- Best for:
  - Viewing image textures
  - Analyzing spatial patterns
  - Creating publication figures

**Implementation details:**
- `viewMode` parameter in STATE (0=3D, 1=2D)
- Shader uses `view_mode` to flatten geometry in 2D
- Camera class dynamically switches projection matrix
- Zoom scaling calibrated for visual consistency

---

### 2. External Image/Video Input

**Feature:** Use images or live webcam feed to drive oscillator dynamics

#### 2a. Image/Video → Natural Frequency (ω)

**How it works:**
1. Image pixels are sampled at grid positions
2. RGB brightness is mapped to natural frequency:
   $$\omega_i = (\text{brightness}_i - 0.5) \times 2 \times \text{amplitude}$$
3. Each oscillator's intrinsic frequency reflects the image intensity

**Usage:**
1. Set **Frequency Pattern (ω)** to **"Image/Video Input"**
2. Click **"📁 Upload Image"** or **"📷 Use Webcam"**
3. Image preview appears in control panel
4. Grid automatically updates with image-based frequencies

**Effect:**
- **Similar colored regions** have similar ω → tend to synchronize
- **Different colored regions** have different ω → resist synchronization
- Result: **Image segmentation through synchronization**
- Regions with uniform color form synchronized clusters

**Applications:**
- Computer vision: object segmentation
- Pattern recognition: identifying coherent regions
- Image processing: edge detection through desynchronization boundaries

#### 2b. Image → Initial Phase (θ)

**How it works:**
1. Select **Phase Pattern (θ)** → **"From Image"**
2. Image brightness maps to initial phase:
   $$\theta_i = \text{brightness}_i \times 2\pi$$
3. Bright pixels → phase near 2π, Dark pixels → phase near 0

**Effect:**
- Initializes pattern structure from image
- Kuramoto dynamics then evolve this structure
- Creates "flowing" effect as image morphs according to coupling rules

#### 2c. Image Texture Colormap

**Feature:** Render oscillators using original image colors, modulated by phase dynamics

**How it works:**
1. Image is loaded as GPU texture
2. Select **Color Mode** → **"Image Texture"** (mode 4)
3. Shader samples texture at oscillator position
4. Color is modulated by current phase:
   $$\text{brightness} = 0.7 + 0.3\sin(\theta_i)$$

**Result:**
- **"Liquid painting" effect**: Image appears to flow and morph
- Original colors preserved but modulated by synchronization
- Synchronized regions pulse together
- Boundaries create wave patterns

**Usage Pipeline:**
```
1. Upload image → sets ω pattern
2. Set θ pattern to "From Image" → initializes phases
3. Set Color Mode to "Image Texture" → shows morphing
4. Switch to 2D view → best visualization
5. Adjust K0 (coupling) → controls how much image flows
```

**Parameters for best effects:**
- **Coupling K0**: 2.0-3.0 (strong coupling for dramatic morphing)
- **Range**: 2-4 (local interaction creates wave patterns)
- **Grid size**: 128-256 (balances detail and performance)
- **Rule**: Classic (0) or Coherence-Gated (1)

**Webcam mode:**
- Captures video frames continuously (~30 FPS)
- Updates ω pattern in real-time
- Creates **live morphing video effect**
- Can initialize θ from each frame or let dynamics evolve

**Technical details:**
- Image downsampled to 128×128 for performance
- Y-coordinate flipped to match grid orientation
- Texture sampling uses bilinear filtering
- Canvas → GPU texture via `copyExternalImageToTexture`

---

### 3. Optimized Performance

**Bind Group Caching:**
- GPU bind groups cached per delay buffer index
- Avoids recreation every frame (2-5x speedup)
- Map-based cache: `bindGroupCache.get(delayIdx)`

**Workgroup Size Optimization:**
- Increased from 8×8 to **16×16** threads per workgroup
- 25-40% speedup on Apple Silicon (M1/M2)
- Better occupancy on modern GPUs

**Partial Uniform Updates:**
- Split parameters into frequently-changing vs static
- `updateParams()`: writes only dt, time (8 bytes) per frame
- `updateFullParams()`: writes all 20 floats (80 bytes) only on user change
- 90% bandwidth reduction for uniform buffer writes
- 10-15% overall speedup

**Performance Benchmarks (M1 Max GPU):**

| Grid Size | FPS (Before) | FPS (After) | Speedup |
|-----------|-------------|------------|---------|
| 128×128 | 25 | 60+ | 2.4× |
| 256×256 | 12 | 28 | 2.3× |
| 512×512 | 3 | 7 | 2.3× |

---

### 4. Dynamic Grid Resizing

**Feature:** Change grid size without reloading page

**How to use:**
1. Enter new grid size (32-1024) in input box
2. Click **"Apply Grid Size"** button
3. System automatically:
   - Destroys old GPU buffers
   - Creates new buffers with correct size
   - Reinitializes simulation state
   - Invalidates cached bind groups

**Keyboard shortcuts:**
- **Shift + ↑**: Increase grid size (×1.25)
- **Shift + ↓**: Decrease grid size (×0.8)
- Clamped to range [32, 1024]

**Performance implications:**

| Grid Size | Memory | Compute Time | Recommended Use |
|-----------|--------|--------------|-----------------|
| 64×64 | 50 KB | <1 ms | Fast exploration |
| 128×128 | 200 KB | ~3 ms | Default, balanced |
| 256×256 | 800 KB | ~15 ms | High detail |
| 512×512 | 3 MB | ~60 ms | Publication figures |
| 1024×1024 | 12 MB | ~250 ms | Research only |

---

### 5. Improved Colormap Cycling

**Feature:** Smart colormap cycling with keyboard shortcut

**Behavior:**
- Press **C** to cycle through colormaps
- **Without external input**: Cycles 0→1→2→3→0 (skips Image Texture)
- **With external input**: Cycles 0→1→2→3→4→0 (includes Image Texture)
- Dropdown automatically updates to show current mode

**Why skip Image Texture?**
- Mode 4 requires loaded texture (otherwise renders black)
- Automatic skipping prevents user confusion
- Seamless workflow: load image → mode 4 becomes available

---

### 6. Camera System Enhancements

**Unified camera controls** for 2D and 3D:

**3D Mode:**
- **Orbit**: Left-drag rotates camera on sphere
- **Pan**: Right-drag moves target point in world space
- **Zoom**: Scroll changes camera distance from target
- Spherical coordinates: (dist, phi, theta)
- lookAt matrix construction

**2D Mode:**
- **Pan**: Drag translates view in XZ plane
- **Zoom**: Scroll changes orthographic box size
- Direct XZ translation (no rotation)
- Orthographic projection matrix

**Zoom calibration:**
- 2D zoom uses `dist / 40` (was 24, updated for better alignment)
- Ensures similar visual scale when toggling 2D/3D
- Press V to switch: objects maintain approximate screen size

**Panning improvements:**
- 2D: Direct mapping (drag right → move right)
- 3D: Considers camera orientation angle
- Proper sign conventions (+ for right, + for up)

---

### 7. UI Improvements

**Responsive controls:**
- All sliders update displays in real-time
- Select dropdowns properly synchronized with state
- Button states reflect current mode (e.g., Pause/Resume)

**External input panel:**
- Dynamically shows/hides based on omega pattern
- Only visible when "Image/Video Input" selected
- Webcam button toggles: "📷 Use Webcam" ↔ "⏹️ Stop Webcam"

**Preset system:**
- 10 presets for common patterns
- Automatically applies rule, parameters, and initial conditions
- Keyboard shortcuts 0-5 for rule switching

**Grid size display:**
- Shows current N = GRID×GRID in stats panel
- Updates immediately after resize
- Format: "256×256" or "128×128"

---

## Practical Workflows

### Workflow 1: Image Segmentation

**Goal:** Use Kuramoto dynamics to segment an image by color similarity

```
Step 1: Load image
  - Frequency Pattern (ω) → "Image/Video Input"
  - Upload an image (faces, landscapes work well)

Step 2: Initialize
  - Coupling Rule → "0: Classic Kuramoto"
  - K0 → 1.5 (moderate coupling)
  - Range → 3 (local neighborhoods)
  - Global Coupling → OFF

Step 3: Run simulation
  - Press Apply & Reset
  - Let it run for 5-10 seconds
  - Observe regions of similar color synchronizing

Step 4: Visualize results
  - Color Mode → "3: Order Parameter"
  - Green regions = synchronized = similar colors in original
  - Red regions = chaotic = boundary regions
  - Press O to toggle overlay

Step 5: Extract segments
  - Each synchronized cluster = one segment
  - Count domains by visual inspection
  - Adjust K0 to merge/split clusters
```

---

### Workflow 2: Morphing Video Art

**Goal:** Create liquid painting effect from webcam or image

```
Step 1: Setup input
  - Frequency Pattern (ω) → "Image/Video Input"
  - Click "📷 Use Webcam" (or upload image)
  - Preview appears in panel

Step 2: Initialize phases
  - Phase Pattern (θ) → "From Image"
  - This sets initial phase from brightness

Step 3: Configure rendering
  - Color Mode → "4: Image Texture"
  - Switch to 2D view (press V)
  - Maximize canvas

Step 4: Tune dynamics
  - Coupling Rule → "1: Coherence-Gated"
  - K0 → 2.5 (strong morphing)
  - Range → 2-3
  - Time Scale → 1.5× (speed up)

Step 5: Enjoy
  - Watch your face/image flow like liquid
  - Move in front of camera → new patterns
  - Try different coupling rules for different effects
```

---

### Workflow 3: Publication-Quality Figures

**Goal:** Generate high-resolution pattern visualizations

```
Step 1: High resolution
  - Grid size → 512
  - Apply Grid Size

Step 2: Load preset
  - Choose pattern (e.g., "🌀 Spiral Pair")
  - Let it settle (10-15 seconds)

Step 3: Optimize view
  - Switch to 2D mode (cleaner for papers)
  - Zoom to frame pattern nicely
  - Remove UI if possible

Step 4: Choose colormap
  - Phase (0): Show phase structure
  - Velocity (1): Show dynamics
  - Order (3): Show synchronization

Step 5: Capture
  - Screenshot at 60 FPS moment
  - Or record video for supplementary material
```

---

## Keyboard Reference (Complete)

| Key | Action | Category |
|-----|--------|----------|
| **0-5** | Switch coupling rule | Rules |
| **V** | Toggle 2D/3D view | View |
| **C** | Cycle colormap | Visualization |
| **O** | Toggle order overlay | Visualization |
| **Space** | Pause/Resume | Control |
| **[** | Slower (×0.5) | Speed |
| **]** | Faster (×2.0) | Speed |
| **R** | Reset simulation | Control |
| **T** | Randomize theta | Control |
| **G** | Toggle global coupling | Topology |
| **Shift+↑** | Increase grid size | Grid |
| **Shift+↓** | Decrease grid size | Grid |

---

## Technical Implementation Notes

### GPU Architecture

**Buffer Layout:**
```
thetaBuf:    [θ₀, θ₁, θ₂, ..., θₙ]           (N × f32)
omegaBuf:    [ω₀, ω₁, ω₂, ..., ωₙ]           (N × f32)
orderBuf:    [R₀, R₁, R₂, ..., Rₙ]           (N × f32)
paramsBuf:   [dt, K0, range, ...]            (20 × f32, uniform)
delayBuf:    [θ(t-τ) for all i]              (32 × N × f32, ring)
textureBuf:  [RGBA image data]               (128×128×4, texture)
```

**Compute Shader Dispatch:**
```
Workgroups: ⌈gridSize / 16⌉ × ⌈gridSize / 16⌉
Threads per workgroup: 16 × 16 = 256
Thread → Oscillator mapping: 1:1
Each thread updates one θᵢ
```

**Render Shader:**
```
Vertex shader: 4 vertices per oscillator (quad)
Instance count: N
Geometry: grid of quads in XZ plane
Height: y = 2sin(θᵢ) in 3D, y = small_offset in 2D
```

---

## Troubleshooting

### Common Issues

**Issue: Image texture shows black**
- Cause: No image loaded, or colormap 4 selected without image
- Fix: Upload image first, or press C to cycle away from mode 4

**Issue: 2D view is flipped/rotated**
- Cause: Texture coordinate mismatch
- Fix: Verify Y-flip in applyExternalInput() function
- Expected: `imgY = (GRID - 1 - row) * height / GRID`

**Issue: Poor performance with webcam**
- Cause: Continuous texture upload every frame
- Fix: Reduce grid size to 128 or 64
- Or: Pause webcam when not needed

**Issue: Zoom levels don't match 2D/3D**
- Cause: Different projection matrices
- Fix: Adjust zoom divisor in Camera.getMatrix()
- Current: 2D uses `dist / 40`, tune to taste

**Issue: Grid resize crashes**
- Cause: Running out of GPU memory
- Fix: Reduce grid size (max 512 on integrated GPUs)
- Check: Browser console for WebGPU errors

---

## Future Extensions (Proposed)

See `EXTENSIONS.md` for detailed proposals:

1. **Graph Topologies**: Move beyond grids to arbitrary networks
2. **Multi-Layer Coupling**: Stack multiple grids with cross-layer coupling
3. **Adaptive Coupling**: Time-dependent K based on global order
4. **3D Volume Rendering**: True 3D grid (not just 2D + height)
5. **Parameter Space Exploration**: Automated scanning of (K, ω) space
6. **Export Capabilities**: Save states, parameters, and videos

---

## Practical Examples

### Example 1: Creating Plane Waves from Scratch

**Goal:** Generate traveling wave pattern without preset

**Steps:**
1. Initial Conditions Panel:
   - Phase Pattern: **Gradient**
   - Frequency Pattern: **Uniform**
   - Frequency Amplitude: **0.2**
   
2. Coupling Rule Panel:
   - Rule: **0 (Classic)**
   - Coupling (K0): **1.0**
   - Range: **2**
   - Global: **OFF**

3. Time Control:
   - Hit "Apply & Reset"
   - Observe stripes moving diagonally

4. To enhance visualization:
   - Press **C** to switch to Velocity colormap
   - Stripes should be orange (moving) with blue background

---

### Example 2: Chimera State with Manual Tuning

**Goal:** Create and observe chimera state

**Steps:**
1. Load preset: **👥 Chimera State**
2. Observe Order Parameter Overlay (press **O**):
   - Left half: green (synchronized)
   - Right half: red (chaotic)
   - Sharp boundary between them

3. Adjust Mexican-hat parameters:
   - Increase $\beta$ (inhibition): boundary blurs
   - Decrease $\beta$: boundary sharpens
   - Adjust $\sigma_2$: changes domain size

4. Measure coherence time:
   -