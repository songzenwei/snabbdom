import { Module } from './modules/module'
import { vnode, VNode } from './vnode'
import * as is from './is'
import { htmlDomApi, DOMAPI } from './htmldomapi'

type NonUndefined<T> = T extends undefined ? never : T

function isUndef (s: any): boolean {
  return s === undefined
}
function isDef<A> (s: A): s is NonUndefined<A> {
  return s !== undefined
}

type VNodeQueue = VNode[]

const emptyNode = vnode('', {}, [], undefined, undefined)

// 比较两个节点是否是相同节点
function sameVnode (vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel
}

// 是否VNode
function isVnode (vnode: any): vnode is VNode {
  return vnode.sel !== undefined
}

type KeyToIndexMap = {[key: string]: number}

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
}

type ModuleHooks = ArraysOf<Required<Module>>

// 返回一个对象 将旧节点的key作为属性，索引作为值
function createKeyToOldIdx (children: VNode[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {}
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key
    if (key !== undefined) {
      map[key] = i
    }
  }
  return map
}

const hooks: Array<keyof Module> = ['create', 'update', 'remove', 'destroy', 'pre', 'post']

// 返回path函数 比较两个新旧节点差异，并更新到dom
// 第一个参数是加载的模块，第二个参数代表需要将 VNode 转为的真实元素的平台 (VNode是跨平台的)
export function init (modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number
  let j: number
  // 模块中的钩子函数集合
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: []
  }

  // 转换真实元素的平台
  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi
  
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]]
      if (hook !== undefined) {
        // 不同模块中相同的钩子执行的时间不同，所以需要处理
        // cbs --- { pre:[fn1, fn2],post:[fn1, fn2] }
        (cbs[hooks[i]] as any[]).push(hook)
      }
    }
  }

  function emptyNodeAt (elm: Element) {
    const id = elm.id ? '#' + elm.id : ''
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''
    // 将 dom 转为 VNode
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm)
  }

  // 删除节点
  function createRmCb (childElm: Node, listeners: number) {
    return function rmCb () {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node
        api.removeChild(parent, childElm)
      }
    }
  }

  // 创建真实dom 并返回 vnode绑定的dom
  function createElm (vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any
    let data = vnode.data
    // 如果data存在，
    if (data !== undefined) {
      const init = data.hook?.init
      // 如果用户设置了init钩子
      if (isDef(init)) {
        init(vnode)
        data = vnode.data
      }
    }
    // 新节点的字元素集合
    const children = vnode.children
    const sel = vnode.sel
    // 如果是注释节点
    if (sel === '!') {
      // vnode.text 不存在
      if (isUndef(vnode.text)) {
        vnode.text = ''
      }
      // 创建注释节点，并将vnode.text 作为注释节点的文本
      vnode.elm = api.createComment(vnode.text!)
    } else if (sel !== undefined) {
      // 如果选择器不为空
      // 解析选择器
      // Parse selector
      const hashIdx = sel.indexOf('#')
      const dotIdx = sel.indexOf('.', hashIdx)
      const hash = hashIdx > 0 ? hashIdx : sel.length
      const dot = dotIdx > 0 ? dotIdx : sel.length
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel
      // 创建svg/dom 元素
      const elm = vnode.elm = isDef(data) && isDef(i = data.ns)
        ? api.createElementNS(i, tag)
        : api.createElement(tag)
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot))
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '))
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode)
      // 如果 vnode 中有子节点 
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i]
          if (ch != null) {
          // 创建子节点的dom，并添加到当前dom中
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue))
          }
        }
      } else if (is.primitive(vnode.text)) {
        // 如果文本节点
        api.appendChild(elm, api.createTextNode(vnode.text))
      }
      
      //添加钩子
      const hook = vnode.data!.hook
      if (isDef(hook)) {
        hook.create?.(emptyNode, vnode)
        if (hook.insert) {
          insertedVnodeQueue.push(vnode)
        }
      }
    } else {
      //创建文本节点
      vnode.elm = api.createTextNode(vnode.text!)
    }
    return vnode.elm
  }

  // 添加节点
  function addVnodes (
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before)
      }
    }
  }

  function invokeDestroyHook (vnode: VNode) {
    const data = vnode.data
    if (data !== undefined) {
      data?.hook?.destroy?.(vnode)
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j]
          if (child != null && typeof child !== 'string') {
            invokeDestroyHook(child)
          }
        }
      }
    }
  }

  // 删除节点 
  function removeVnodes (parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number
      let rm: () => void
      const ch = vnodes[startIdx]
      if (ch != null) {
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch)
          listeners = cbs.remove.length + 1
          rm = createRmCb(ch.elm!, listeners) // 真正的节点删除方法
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm)
          const removeHook = ch?.data?.hook?.remove
          if (isDef(removeHook)) {
            removeHook(ch, rm)
          } else {
            rm()
          }
        } else { // Text node
          api.removeChild(parentElm, ch.elm!)
        }
      }
    }
  }

  // 对比新旧子节点差异 diff算法的核心
  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    // oldVnode 开始索引
    let oldStartIdx = 0
    // newVnode 开始索引
    let newStartIdx = 0
    // oldVnode 结束索引
    let oldEndIdx = oldCh.length - 1
    // 对比时的开始oldVnode
    let oldStartVnode = oldCh[0]
    // 对比时的结束oldVnode
    let oldEndVnode = oldCh[oldEndIdx]
    // newVnode 结束索引
    let newEndIdx = newCh.length - 1
    // 对比时的开始newVnode
    let newStartVnode = newCh[0]
    // 对比时的结束newVnode
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any
    
    // 如果新旧 VNode 节点都没遍历完
    // 进行遍历，四个比较过程
    // oldVnodeStartIndex ————> newVnodeStartIndex
    // oldVnodeEndIndex ————> newVnodeEndIndex
    // oldVnodeStartIndex ————> newVnodeEndIndex
    // oldVnodeEndIndex ————> newVnodeStartIndex
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 如果oldStartVnode 和 newStartVnode 是相同节点
        // 对比两个节点的差异
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        // 索引 +1
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        // 如果 oldStartVnode 和 newEndVnode 是相同节点 ，对比两个节点差异
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        // 将 oldStartVnode 移动到右边
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
          // 如果 oldEndVnode 和 newStartVnode 是相同节点 ，对比两个节点差异
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
           // 将 oldEndVnode 移动到左边
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        // 如果上述条件都不相同，
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        // 用 newStartVnode的 key 去老节点中查找具有相同 key 的节点
        idxInOld = oldKeyToIdx[newStartVnode.key as string]
        // 如果没查找到对应的旧节点，说明是新节点
        if (isUndef(idxInOld)) { // New element
          // 创建新的 dom 插入到最开始位置
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else {
          // 如果查找到，记录老节点索引
          elmToMove = oldCh[idxInOld]
          // 如果不是相同节点 
          if (elmToMove.sel !== newStartVnode.sel) {
            // 创建新的 dom 并移动到最开始位置
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            // 如果是相同节点，对比差异，更新dom  
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined as any
            // 把找到的对应的dom元素移动到最前面
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    // 比较完后会进行收尾操作
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
    // 如果老节点数组先遍历完 则在老节点后边将剩余的新节点添加进去
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else {
        // 如果新节点便利完，则删除老节点剩余未比较的节点
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
      }
    }
  }

  // 对比新旧两个节点的差异
  function patchVnode (oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    const hook = vnode.data?.hook
    // 用户是否设置了 prepatch 钩子,如果有就执行
    hook?.prepatch?.(oldVnode, vnode)
    // 因为新旧节点的 key 和sel相同 说明是同一个节点，直接操作老节点
    const elm = vnode.elm = oldVnode.elm!
    const oldCh = oldVnode.children as VNode[]
    const ch = vnode.children as VNode[]
    // 如果新旧 vode 相同说明没有差异
    if (oldVnode === vnode) return
    if (vnode.data !== undefined) {
       // 用户是否设置了 update 钩子,如果有就执行
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      vnode.data.hook?.update?.(oldVnode, vnode)
    }
    // 如果新节点拥有子元素 (没有 text 属性 )
    if (isUndef(vnode.text)) {
      // 如果新旧 VNode 都有 children 子元素，对比子元素差异
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue)
        // 如果新 VNode 具有子元素
      } else if (isDef(ch)) {
        // 如果旧 VNode 具有文本属性
        if (isDef(oldVnode.text)) api.setTextContent(elm, '')
        // 将新 VNode 的子元素添加到 dom 中
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 如果老 VNode 具有子元素，移除全部子元素
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
        // 如果老 VNode 具有 text 属性，移除全部子元素
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 判断新旧 VNode 的 text 属性是否相同
      if (isDef(oldCh)) {
        // 如果老节点具有子元素，删除老节点的子元素，不直接使用新节点的文本替换老节点子元素是因为删除钩子中具有过渡属性，如果直接替换则过渡动画不会执行
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }
      api.setTextContent(elm, vnode.text!)
    }
    // 执行postpatch钩子
    hook?.postpatch?.(oldVnode, vnode)
  }

  /** 
   *  核心
   *  path 整体过程分析
   *  patch(oldVnode, newVnode)
   *  把新节点中变化的内容渲染到真实的DOM，最后返回新节点作为下一次处理的旧节点
   *  对比新旧 VNode 是否相同节点 （节点的key和sel属性相同）
   *  如果是不相同节点，删除之前的内容，重新渲染 
   *  如果是相同节点，在判断新的 VNode是否有text，如果有并且和 oldVnode 的 text 不同，直接更新文本内容 （patchVnode）
   *  如果新的 VNode 有children，判断子节点是否有变化 (updateChildren)
   */
  return function patch (oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node
    const insertedVnodeQueue: VNodeQueue = []
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]()

    // 如果不是是 VNode （真实dom）
    if (!isVnode(oldVnode)) {
      // 将真实dom转为 VNode
      oldVnode = emptyNodeAt(oldVnode)
    }

    // 如果是相同节点 （新旧节点的key和sel属性相同）
    if (sameVnode(oldVnode, vnode)) {
      // 对比两个节点的差异，并更新dom
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else {
      // 如果不是相同节点
      elm = oldVnode.elm!
      // 获取旧节点的父元素
      parent = api.parentNode(elm) as Node

      //创建真实dom
      createElm(vnode, insertedVnodeQueue)

      if (parent !== null) {
        // 如果旧元素具备父元素，将新vode创建的真实dom插入到parent中
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm))
        // 删除旧节点
        removeVnodes(parent, [oldVnode], 0, 0)
      }
    }

    //执行 insert 钩子
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i])
    }
    //执行模块 post钩子
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]()
    return vnode
  }
}
