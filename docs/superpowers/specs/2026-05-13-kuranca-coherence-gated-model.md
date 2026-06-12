# KuraNCA Coherence-Gated Model

## Purpose

KuraNCA should be the smallest model where oscillator state is causally necessary for living matter, not a decorative phase overlay on Lenia.

## Cell State

Each cell carries matter, fixed hidden memory, and a unit-vector oscillator:

$$
\text{cell}_i = (a_i, \mathbf{h}_i, \mathbf{x}_i)
$$

$$
a_i \in [0,1], \qquad \mathbf{h}_i \in [0,1]^4, \qquad \mathbf{x}_i \in S^{d-1}, \qquad \|\mathbf{x}_i\| = 1
$$

For the current WebGPU implementation, use the existing scalar phase texture as the \(d=2\) case:

$$
\mathbf{x}_i =
\begin{bmatrix}
\cos\theta_i \\
\sin\theta_i
\end{bmatrix}
$$

There is no separate phase variable in the conceptual model. Phase is only a coordinate for the two-dimensional unit vector.

## Matter Perception

Use an excitatory inner kernel and inhibitory surround:

$$
E_i = \sum_j K_E(r_{ij}) a_j
$$

$$
I_i = \sum_j K_I(r_{ij}) a_j
$$

$$
u_i = E_i - \beta I_i
$$

The current Mexican-hat controls map to:

- \(\sigma\): inner support radius
- \(\sigma_2\): outer surround radius
- \(\beta\): surround strength

The growth window is:

$$
G_i =
2\exp\left(-\frac{(u_i-\mu)^2}{2\sigma_G^2}\right)-1
$$

Split it into birth and density-death parts:

$$
G_i^+ = \max(G_i,0), \qquad G_i^- = \max(-G_i,0)
$$

## Oscillator Perception

Living neighbors vote for a local oscillator direction:

$$
\mathbf{M}_i =
\frac{
\sum_j K_E(r_{ij}) a_j \mathbf{x}_j
}{
\epsilon + \sum_j K_E(r_{ij}) a_j
}
$$

Local coherence is the length of that vote:

$$
R_i = \|\mathbf{M}_i\|
$$

For \(d=2\), the Kuramoto torque is:

$$
T_i =
\operatorname{Im}(\bar{z_i}M_i)
=
R_i\sin(\phi_i-\theta_i)
$$

For general \(d\), use tangent-space projection:

$$
\dot{\mathbf{x}}_i =
\Omega_i\mathbf{x}_i
+
k_\theta \operatorname{Proj}_{\mathbf{x}_i}(\mathbf{M}_i)
$$

$$
\operatorname{Proj}_{\mathbf{x}}(\mathbf{y})
=
\mathbf{y}-(\mathbf{x}\cdot\mathbf{y})\mathbf{x}
$$

## Coherence Gate

Matter is trusted only when the local living oscillator tissue has enough agreement:

$$
C_i = \operatorname{smoothstep}(R_{\min}, R_{\max}, R_i)
$$

`ncaCoherenceMin` and `ncaCoherenceMax` expose \(R_{\min}\) and \(R_{\max}\) as model controls. This starts simpler than a preferred-coherence Gaussian. If the field collapses into boring global synchrony later, a target-band coherence gate can replace this monotone gate.

## Matter Update

The matter equation is birth minus death:

First average the local hidden state over living excitatory neighbors:

$$
\mathbf{H}_i =
\frac{
\sum_j K_E(r_{ij}) a_j \mathbf{h}_j
}{
\epsilon + \sum_j K_E(r_{ij}) a_j
}
$$

Then use fixed hidden memory as a weak morphogenetic bias:

$$
m_i = \operatorname{clip}_{[0,1.5]}\left(0.75 + k_h(h_{i,0}+H_{i,0}-h_{i,1})\right)
$$

$$
\dot{a}_i =
k_a
\left[
C_i^2G_i^+m_i(1-a_i)
-
\left(G_i^-+\lambda(1-C_i)+I_i+k_h\max(h_{i,1}-h_{i,0},0)+d\right)a_i
\right]
$$

Interpretation:

- \(C_i^2G_i^+m_i(1-a_i)\): strongly coherent, density-supported birth into empty capacity, biased by hidden activation
- \(G_i^-a_i\): death from bad density
- \(\lambda(1-C_i)a_i\): death from incoherence
- \(I_ia_i\): death from inhibitory surround / overcrowding
- \(k_h\max(h_{i,1}-h_{i,0},0)a_i\): death from hidden inhibition exceeding hidden activation
- \(da_i\): passive decay

Then:

$$
a_i' = \operatorname{clip}_{[0,1]}(a_i+\Delta t\dot{a}_i)
$$

For \(d=2\):

$$
\dot{\theta}_i = \omega_i + k_\theta T_i
$$

$$
\theta_i' = \operatorname{wrap}(\theta_i+\Delta t\dot{\theta}_i)
$$

For \(d>2\):

$$
\mathbf{x}_i' =
\operatorname{normalize}(\mathbf{x}_i+\Delta t\dot{\mathbf{x}}_i)
$$

The four current hidden channels are deliberately fixed, not learned:

$$
\mathbf{h}'_i =
\operatorname{mix}\left(
\mathbf{h}_i,
\begin{bmatrix}
C_i^2G_i^+ \\
I_i \\
R_i \\
a'_i
\end{bmatrix},
k_h
\right)
$$

They encode birth activation, inhibitory surround, local coherence, and recent matter. This gives Rule 7 a real NCA-like memory state without hiding substrate bugs behind a trainable MLP.

## Implementation Notes

Phase 1 of this model keeps the current \(d=2\) oscillator storage and compact UI, and adds an `rgba32float` hidden-state ping-pong texture. `ncaSyncFeedback` is reinterpreted as incoherence death strength \(\lambda\). `ncaHiddenMemory` is the hidden-state update rate and feedback strength. The coherence gate thresholds are explicit controls because they define how much local oscillator agreement is required for matter birth.

Future \(d>2\) work should replace phase storage with a unit-vector texture and use the projection update directly. Future learned work should replace the fixed hidden update with learned kernels and a small local update network.
