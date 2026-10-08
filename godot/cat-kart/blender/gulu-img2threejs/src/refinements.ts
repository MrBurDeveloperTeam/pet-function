import * as THREE from 'three';

function sculptedEye(dim: number[]): THREE.BufferGeometry {
  const g=new THREE.SphereGeometry(.5,64,48); const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,y);
    if(z>0){
      const irisGroove=.015*Math.exp(-Math.pow((r-.34)/.016,2));
    const pupilBowl=.008*Math.exp(-Math.pow(r/.23,4));
      p.setZ(i,z-irisGroove-pupilBowl);
    }
  }
  g.clearGroups();const colors:number[]=[];
  const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  for(let i=0;i<p.count;i++){
    const r=Math.hypot(p.getX(i),p.getY(i));const iris=1-smooth(.365,.390,r);const pupil=1-smooth(.220,.240,r);
    const value=p.getZ(i)>0?(.26*(1-iris)+.20*iris)*(1-pupil)+.035*pupil:.26;
    colors.push(value,value,value);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.scale(...dim as [number,number,number]);g.computeVertexNormals();return g;
}

function embeddedEyelid(dim:number[]):THREE.BufferGeometry {
  // Closed skin rim: front lip follows the cornea; outer skirt sinks into facial skin.
  const section=[[.410,-.009],[.438,.002],[.490,-.004],[.530,-.028],[.430,-.031]];
  const n=96,positions:number[]=[],indices:number[]=[];
  for(const [r,z] of section)for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;positions.push(Math.cos(a)*r*dim[0],Math.sin(a)*r*dim[1],z);
  }
  for(let k=0;k<section.length;k++)for(let i=0;i<n;i++){
    const a=k*n+i,b=k*n+(i+1)%n,c=((k+1)%section.length)*n+i,d=((k+1)%section.length)*n+(i+1)%n;
    indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function sculptedNose(dim: number[]): THREE.BufferGeometry {
  const s=new THREE.Shape();s.moveTo(0,-.46);
  s.bezierCurveTo(-.10,-.40,-.43,0,-.46,.25);
  s.bezierCurveTo(-.50,.46,-.35,.50,-.13,.42);
  s.bezierCurveTo(-.07,.38,.07,.38,.13,.42);
  s.bezierCurveTo(.35,.50,.50,.46,.46,.25);
  s.bezierCurveTo(.43,0,.10,-.40,0,-.46);
  const outline=s.getPoints(16);outline.pop();const n=outline.length;
  const pos:number[]=[],idx:number[]=[];
  const rings:[[number,number],...Array<[number,number]>]=[[.002,-.50],[.5,-.45],[.86,-.30],[1,0],[.98,.25],[.86,.40],[.65,.49],[.53,.51],[.41,.52],[.29,.525],[.17,.528],[.06,.53],[.001,.53]];
  for(const [scale,z] of rings){for(const v of outline){const x=v.x*scale,y=v.y*scale;
      const dent=(Math.exp(-(((x-.25)/.072)**2)-((y-.16)/.085)**2)+Math.exp(-(((x+.25)/.072)**2)-((y-.16)/.085)**2))*.14*Math.max(0,(z-.24)/.29);
      pos.push(x*dim[0],y*dim[1],(z-dent)*dim[2]);}}
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<n;j++){const a=k*n+j,b=k*n+(j+1)%n,c=(k+1)*n+j,d=(k+1)*n+(j+1)%n;idx.push(a,c,b,b,c,d);}
  const rear=pos.length/3;pos.push(0,0,-.5*dim[2]);const front=pos.length/3;pos.push(0,0,.53*dim[2]);
  for(let j=0;j<n;j++){const k=(j+1)%n;idx.push(rear,j,k,front,(rings.length-1)*n+k,(rings.length-1)*n+j);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function roundedKittenTail(points: number[][]): THREE.BufferGeometry {
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const steps=80,radial=32,frames=path.computeFrenetFrames(steps,false),pos:number[]=[],idx:number[]=[];
  for(let i=0;i<steps;i++){const t=i/steps,center=path.getPointAt(t),cap=t<.86?1:Math.sqrt(Math.max(0,1-((t-.86)/.14)**2));const r=(.066+.007*Math.sin(t*Math.PI)) * cap;
    for(let j=0;j<radial;j++){const a=j/radial*Math.PI*2,offset=frames.normals[i].clone().multiplyScalar(Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r);const p=center.clone().add(offset);pos.push(p.x,p.y,p.z);}}
  for(let i=0;i<steps-1;i++)for(let j=0;j<radial;j++){const k=(j+1)%radial,a=i*radial+j,b=i*radial+k,c=(i+1)*radial+j,d=(i+1)*radial+k;idx.push(a,b,c,b,d,c);}
  const a=pos.length/3,root=path.getPointAt(0);pos.push(root.x,root.y,root.z);const b=pos.length/3,tip=path.getPointAt(1);pos.push(tip.x,tip.y,tip.z);
  for(let j=0;j<radial;j++){const k=(j+1)%radial;idx.push(a,k,j,b,(steps-1)*radial+j,(steps-1)*radial+k);}
  let volume=0;for(let i=0;i<idx.length;i+=3){const a=new THREE.Vector3().fromArray(pos,idx[i]*3),b=new THREE.Vector3().fromArray(pos,idx[i+1]*3),c=new THREE.Vector3().fromArray(pos,idx[i+2]*3);volume+=a.dot(b.cross(c))/6;}
  if(volume<0)for(let i=0;i<idx.length;i+=3){const tmp=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=tmp;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function subdivideSkin(g:THREE.BufferGeometry):THREE.BufferGeometry {
  const p=g.attributes.position,old=g.index!;const positions=Array.from(p.array) as number[],indices:number[]=[],edges=new Map<string,number>();
  const midpoint=(a:number,b:number)=>{
    const key=a<b?`${a}:${b}`:`${b}:${a}`;const found=edges.get(key);if(found!==undefined)return found;
    const id=positions.length/3;for(let k=0;k<3;k++)positions.push((positions[a*3+k]+positions[b*3+k])/2);edges.set(key,id);return id;
  };
  for(let i=0;i<old.count;i+=3){const a=old.getX(i),b=old.getX(i+1),c=old.getX(i+2),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));out.setIndex(indices);out.computeVertexNormals();return out;
}

export function refineGuluGeometry(root: THREE.Group): void {
  root.traverse(obj=>{
    if(!(obj instanceof THREE.Mesh))return;
    const c=obj.userData.sculptComponent;if(!c)return;
    const dim=[c.dimensions.width,c.dimensions.height,c.dimensions.depth];
    if(c.id==='eye-l'||c.id==='eye-r'){
      obj.geometry.dispose();obj.geometry=sculptedEye(dim);
      obj.material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.30});
    } else if(c.id==='nose') {obj.geometry.dispose();obj.geometry=sculptedNose(dim);}
    else if(c.id==='eyelid-l'||c.id==='eyelid-r'){
      obj.geometry.dispose();obj.geometry=embeddedEyelid(dim);
    }
    else if(c.id==='tail'){
      obj.geometry.dispose();obj.geometry=roundedKittenTail(c.geometryDescriptor.kittenTail.controlPoints);
    } else if(c.id==='head'||c.id==='body'){
      const g=obj.geometry,p=g.attributes.position,idx=g.index;const neighbors=Array.from({length:p.count},()=>new Set<number>());
      if(idx){for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),d=idx.getX(i+2);neighbors[a].add(b).add(d);neighbors[b].add(a).add(d);neighbors[d].add(a).add(b);}}
      const delta=new Float32Array(p.count*3);
      for(let step=0;step<8;step++){
        const factor=step%2===0?.22:-.225;
        for(let i=0;i<p.count;i++){const n=neighbors[i];if(!n.size)continue;let x=0,y=0,z=0;n.forEach(j=>{x+=p.getX(j);y+=p.getY(j);z+=p.getZ(j);});delta[3*i]=(x/n.size-p.getX(i))*factor;delta[3*i+1]=(y/n.size-p.getY(i))*factor;delta[3*i+2]=(z/n.size-p.getZ(i))*factor;}
        for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+delta[3*i],p.getY(i)+delta[3*i+1],p.getZ(i)+delta[3*i+2]);
      }
      p.needsUpdate=true;g.computeVertexNormals();
    }
  });
  // One continuous skin surface: whisker pads and lips have volume; the mouth is an inset cleft.
  const head=root.getObjectByName('head') as THREE.Mesh;
  if(head?.isMesh){
    const old=head.geometry;head.geometry=subdivideSkin(old);old.dispose();
    const p=head.geometry.attributes.position;
    const detail=head.userData.sculptComponent.geometryDescriptor.mouthRefinement;
    const colors=new Float32Array(p.count*3).fill(1);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(z<.14||Math.abs(x)>.13||y<.495||y>.620)continue;
      const gauss=(v:number,s:number)=>Math.exp(-Math.pow(v/s,2));
      const a=Math.abs(x),mouthY=.555+.011*gauss(a,.010)+.004*Math.pow(a/.041,2);
      const pads=detail.padAmplitude*(gauss(x-.046,.033)+gauss(x+.046,.033))*gauss(y-.578,.029);
      const lower=.0015*gauss(x,.035)*gauss(y-.544,.012);
      const crease=gauss(y-mouthY,detail.cleftWidth)*Math.exp(-Math.pow(a/.038,6));
      const cleft=detail.cleftDepth*crease;
      const philtrum=.0028*gauss(x,.004)*gauss(y-.579,.013);
      const weight=THREE.MathUtils.smoothstep(z,.14,.23);
      p.setZ(i,z+(pads+lower-cleft-philtrum)*weight);
      const occlusion=1-detail.cleftOcclusionStrength*crease*weight-.25*gauss(x,.004)*gauss(y-.579,.013)*weight;
      colors[i*3]=colors[i*3+1]=colors[i*3+2]=occlusion;
    }
    head.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    head.material=new THREE.MeshStandardMaterial({color:0xa6a19a,vertexColors:true,roughness:.76});
    p.needsUpdate=true;head.geometry.computeVertexNormals();head.geometry.computeBoundingSphere();
    for(const name of ['mouth-l','mouth-r','philtrum']){const obj=root.getObjectByName(name);if(obj)obj.visible=false;}
  }
}
